import express from "express";
import session from "express-session";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { getDb, migrate, boolToInt } from "./db.js";
import { configurePush, deleteSubscription, pushConfigured, saveSubscription, sendPushToAll } from "./push.js";
import { alertsPage, loginPage, logsPage, productFormPage, productListPage, pushPage } from "./views.js";
import { runCheck, setPaused, startScanner } from "./scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

migrate();
configurePush();

const app = express();
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "128kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(session({
  name: "tcg.sid",
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

function requireAuth(req, res, next) {
  if (req.session.authed) return next();
  res.redirect("/login");
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/login", (req, res) => res.send(loginPage()));
app.post("/login", (req, res) => {
  if (!config.adminPassword) return res.status(500).send(loginPage("ADMIN_PASSWORD is not configured."));
  if (req.body.password === config.adminPassword) {
    req.session.authed = true;
    res.redirect("/");
    return;
  }
  res.status(401).send(loginPage("Invalid password."));
});
app.post("/logout", requireAuth, (req, res) => req.session.destroy(() => res.redirect("/login")));

app.get("/", requireAuth, (req, res) => {
  const products = getDb().prepare("SELECT * FROM products ORDER BY enabled DESC, name ASC").all();
  res.send(productListPage(products));
});

app.get("/products/new", requireAuth, (req, res) => res.send(productFormPage()));
app.post("/products", requireAuth, (req, res) => {
  const body = normalizeProductBody(req.body);
  getDb().prepare(`
    INSERT INTO products (
      name, store, product_url, max_price, approved_seller, enabled,
      check_interval_seconds, alert_cooldown_minutes, notes
    ) VALUES (@name, @store, @product_url, @max_price, @approved_seller, @enabled,
      @check_interval_seconds, @alert_cooldown_minutes, @notes)
  `).run(body);
  res.redirect("/");
});

app.get("/products/:id/edit", requireAuth, (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) return res.status(404).send("Not found");
  res.send(productFormPage(product));
});

app.post("/products/:id", requireAuth, (req, res) => {
  const body = normalizeProductBody(req.body);
  body.id = Number(req.params.id);
  getDb().prepare(`
    UPDATE products SET
      name = @name,
      store = @store,
      product_url = @product_url,
      max_price = @max_price,
      approved_seller = @approved_seller,
      enabled = @enabled,
      check_interval_seconds = @check_interval_seconds,
      alert_cooldown_minutes = @alert_cooldown_minutes,
      notes = @notes,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = @id
  `).run(body);
  res.redirect("/");
});

app.post("/products/:id/delete", requireAuth, (req, res) => {
  getDb().prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  res.redirect("/");
});

app.post("/products/:id/check", requireAuth, async (req, res) => {
  const product = getProduct(req.params.id);
  if (product) await runCheck(product);
  res.redirect("/");
});

app.post("/scanner/pause", requireAuth, (req, res) => {
  setPaused(true);
  res.redirect("/");
});

app.post("/scanner/resume", requireAuth, (req, res) => {
  setPaused(false);
  res.redirect("/");
});

app.get("/push", requireAuth, (req, res) => {
  const subscriptions = getDb().prepare("SELECT * FROM push_subscriptions ORDER BY created_at DESC").all();
  res.send(pushPage(subscriptions));
});

app.get("/api/vapid-public-key", requireAuth, (req, res) => {
  res.json({ publicKey: config.vapidPublicKey, configured: pushConfigured() });
});

app.post("/subscribe", requireAuth, (req, res) => {
  saveSubscription(req.body, req.get("user-agent") || "");
  res.json({ ok: true });
});

app.post("/unsubscribe", requireAuth, (req, res) => {
  deleteSubscription(req.body.endpoint);
  res.json({ ok: true });
});

app.post("/test-push", requireAuth, async (req, res) => {
  const result = await sendPushToAll({
    title: "TCG Stock Watcher test",
    body: "Push notifications are working.",
    url: "/"
  });
  res.json({ ok: true, result });
});

app.get("/alerts", requireAuth, (req, res) => {
  const alerts = getDb().prepare(`
    SELECT alerts.*, products.name AS product_name
    FROM alerts LEFT JOIN products ON products.id = alerts.product_id
    ORDER BY sent_at DESC LIMIT 100
  `).all();
  res.send(alertsPage(alerts));
});

app.get("/logs", requireAuth, (req, res) => {
  const checks = getDb().prepare(`
    SELECT status_checks.*, products.name AS product_name
    FROM status_checks LEFT JOIN products ON products.id = status_checks.product_id
    ORDER BY checked_at DESC LIMIT 150
  `).all();
  res.send(logsPage(checks));
});

function getProduct(id) {
  return getDb().prepare("SELECT * FROM products WHERE id = ?").get(id);
}

function normalizeProductBody(body) {
  const interval = Math.max(Number(body.check_interval_seconds || config.scanDefaultIntervalSeconds), config.minIntervalSeconds);
  return {
    name: String(body.name || "").trim(),
    store: body.store === "walmart" ? "walmart" : "target",
    product_url: String(body.product_url || "").trim(),
    max_price: Number(body.max_price),
    approved_seller: String(body.approved_seller || "").trim(),
    enabled: boolToInt(body.enabled === "on" || body.enabled === true),
    check_interval_seconds: interval,
    alert_cooldown_minutes: Math.max(Number(body.alert_cooldown_minutes || 60), 1),
    notes: String(body.notes || "").trim()
  };
}

app.listen(config.port, () => {
  console.log(`TCG Stock Watcher listening on ${config.port}`);
  startScanner();
});
