import { config } from "../config.js";

const JSON_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.8",
        "user-agent": "TCGStockWatcher/1.0 personal stock alert checker"
      }
    });
    const html = await response.text();
    return { ok: response.ok, statusCode: response.status, html };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "accept-language": "en-US,en;q=0.8",
        "origin": "https://www.target.com",
        "referer": "https://www.target.com/",
        "user-agent": "TCGStockWatcher/1.0 personal stock alert checker"
      }
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, statusCode: response.status, json: null, text };
    }
    return { ok: response.ok, statusCode: response.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

export function unknown(message, rawSummary = "") {
  return {
    status: "unknown",
    in_stock: false,
    online_available: false,
    price: null,
    seller: null,
    confidence: "low",
    message,
    raw_summary: rawSummary
  };
}

export function extractLdJson(html) {
  const blocks = [];
  for (const match of html.matchAll(JSON_RE)) {
    const text = decodeEntities(stripTags(match[1])).trim();
    try {
      const parsed = JSON.parse(text);
      blocks.push(parsed);
    } catch {
      // Retail pages sometimes include invalid JSON-LD. Ignore and use other signals.
    }
  }
  return blocks.flatMap(flattenJson);
}

export function flattenJson(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJson);
  if (value && typeof value === "object") {
    const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(flattenJson) : [];
    return [value, ...graph];
  }
  return [];
}

export function stripTags(value) {
  return String(value).replace(/<[^>]*>/g, "");
}

export function decodeEntities(value) {
  return String(value)
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function textIncludesAny(html, phrases) {
  const lower = String(html).toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase.toLowerCase()));
}

export function cleanSeller(value) {
  if (!value) return null;
  return String(value).replace(/\s+/g, " ").trim();
}

export function normalizeAvailability(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("instock") || text.includes("in stock")) return true;
  if (text.includes("outofstock") || text.includes("out of stock") || text.includes("soldout")) return false;
  return null;
}

export function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const match = String(value).replaceAll(",", "").match(/[0-9]+(?:\.[0-9]{1,2})?/);
  if (!match) return null;
  const price = Number(match[0]);
  return Number.isFinite(price) ? price : null;
}

export function getPrimaryOffer(productNode) {
  const offers = Array.isArray(productNode?.offers) ? productNode.offers : [productNode?.offers];
  return offers.find((offer) => offer && typeof offer === "object") || null;
}
