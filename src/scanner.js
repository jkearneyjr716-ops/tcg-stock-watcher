import { getDb, nowIso, boolToInt } from "./db.js";
import { checkProduct } from "./checkers/index.js";
import { sendPushToAll } from "./push.js";

let timer = null;
let running = false;

export function startScanner() {
  if (timer) return;
  schedule(2500);
}

export function stopScanner() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export function isPaused() {
  const row = getDb().prepare("SELECT value FROM app_state WHERE key = 'scanner_paused'").get();
  return row?.value === "1";
}

export function setPaused(paused) {
  getDb().prepare(`
    INSERT INTO app_state (key, value) VALUES ('scanner_paused', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(paused ? "1" : "0");
}

function schedule(ms = 15000) {
  timer = setTimeout(tick, ms);
}

async function tick() {
  timer = null;
  if (running) {
    schedule(5000);
    return;
  }

  running = true;
  try {
    if (!isPaused()) {
      const product = nextDueProduct();
      if (product) await runCheck(product);
    }
  } catch (error) {
    console.error("Scanner loop error", error);
  } finally {
    running = false;
    schedule(15000 + Math.floor(Math.random() * 10000));
  }
}

function nextDueProduct() {
  return getDb().prepare(`
    SELECT * FROM products
    WHERE enabled = 1
      AND (next_check_at IS NULL OR next_check_at <= ?)
    ORDER BY COALESCE(next_check_at, '1970-01-01') ASC, id ASC
    LIMIT 1
  `).get(nowIso());
}

export async function runCheck(product) {
  const db = getDb();
  const startedAt = nowIso();
  let result;
  try {
    result = await checkProduct(product);
  } catch (error) {
    result = {
      status: "unknown",
      in_stock: false,
      online_available: false,
      price: null,
      seller: null,
      confidence: "low",
      message: `Checker crashed safely: ${error.message}`,
      raw_summary: ""
    };
  }

  db.prepare(`
    INSERT INTO status_checks (
      product_id, status, in_stock, online_available, price, seller, confidence, message, checked_at, raw_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    product.id,
    result.status,
    boolToInt(result.in_stock),
    boolToInt(result.online_available),
    result.price,
    result.seller,
    result.confidence,
    result.message,
    startedAt,
    result.raw_summary || ""
  );

  const nextCheckAt = new Date(Date.now() + nextIntervalMs(product.check_interval_seconds)).toISOString();
  db.prepare(`
    UPDATE products SET
      last_status = ?,
      last_price = ?,
      last_seller = ?,
      last_in_stock = ?,
      last_checked_at = ?,
      next_check_at = ?,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(
    result.status,
    result.price,
    result.seller,
    boolToInt(result.in_stock),
    startedAt,
    nextCheckAt,
    product.id
  );

  const refreshed = db.prepare("SELECT * FROM products WHERE id = ?").get(product.id);
  if (shouldAlert(refreshed, result)) {
    await createAndSendAlert(refreshed, result);
  }

  return result;
}

function nextIntervalMs(seconds) {
  const base = Math.max(Number(seconds) || 900, 300) * 1000;
  const jitter = Math.floor(Math.random() * Math.min(base * 0.25, 120000));
  return base + jitter;
}

export function shouldAlert(product, result) {
  if (!product.enabled) return false;
  if (result.status !== "in_stock" || result.confidence === "low") return false;
  if (!result.in_stock || !result.online_available) return false;
  if (result.price === null || result.price === undefined) return false;
  if (Number(result.price) > Number(product.max_price)) return false;
  if (!sellerMatches(product.approved_seller, result.seller)) return false;
  if (!product.last_alerted_at) return true;

  const cooldownMs = Math.max(Number(product.alert_cooldown_minutes) || 60, 1) * 60 * 1000;
  return Date.now() - new Date(product.last_alerted_at).getTime() >= cooldownMs;
}

export function sellerMatches(approvedSeller, actualSeller) {
  if (!approvedSeller) return true;
  if (!actualSeller) return false;
  return String(actualSeller).toLowerCase().includes(String(approvedSeller).toLowerCase());
}

async function createAndSendAlert(product, result) {
  const db = getDb();
  const price = Number(result.price).toFixed(2);
  const title = `${product.name} is in stock`;
  const body = `${product.store.toUpperCase()} - $${price}${result.seller ? ` - ${result.seller}` : ""}`;
  const info = db.prepare(`
    INSERT INTO alerts (product_id, title, body, target_url, price, seller)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(product.id, title, body, product.product_url, result.price, result.seller);

  const delivery = await sendPushToAll({
    title,
    body,
    url: product.product_url,
    productId: product.id,
    store: product.store,
    price: result.price,
    seller: result.seller
  });

  db.prepare(`
    UPDATE alerts SET delivery_status = ?, error = ? WHERE id = ?
  `).run(delivery.skipped ? "push_not_configured" : `sent:${delivery.sent},failed:${delivery.failed}`, null, info.lastInsertRowid);

  db.prepare("UPDATE products SET last_alerted_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
    .run(nowIso(), product.id);
}
