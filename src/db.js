import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

let db;

export function getDb() {
  if (db) return db;
  const dir = path.dirname(config.databasePath);
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function migrate() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      store TEXT NOT NULL CHECK (store IN ('target', 'walmart')),
      product_url TEXT NOT NULL,
      max_price REAL NOT NULL,
      approved_seller TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      check_interval_seconds INTEGER NOT NULL DEFAULT 900,
      alert_cooldown_minutes INTEGER NOT NULL DEFAULT 60,
      last_status TEXT NOT NULL DEFAULT 'unknown',
      last_price REAL,
      last_seller TEXT,
      last_in_stock INTEGER NOT NULL DEFAULT 0,
      last_checked_at TEXT,
      last_alerted_at TEXT,
      next_check_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      target_url TEXT NOT NULL,
      price REAL,
      seller TEXT,
      sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      delivery_status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS status_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      in_stock INTEGER NOT NULL DEFAULT 0,
      online_available INTEGER NOT NULL DEFAULT 0,
      price REAL,
      seller TEXT,
      confidence TEXT NOT NULL DEFAULT 'low',
      message TEXT,
      checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      raw_summary TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_enabled_next_check ON products(enabled, next_check_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_product_sent ON alerts(product_id, sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_status_checks_product_checked ON status_checks(product_id, checked_at DESC);
  `);

  database.prepare(`
    INSERT OR IGNORE INTO app_state (key, value) VALUES ('scanner_paused', '0')
  `).run();
}

export function nowIso() {
  return new Date().toISOString();
}

export function boolToInt(value) {
  return value ? 1 : 0;
}

export function intToBool(value) {
  return Number(value) === 1;
}
