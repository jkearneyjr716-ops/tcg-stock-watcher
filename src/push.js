import webpush from "web-push";
import { config } from "./config.js";
import { getDb } from "./db.js";

export function configurePush() {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  return true;
}

export function pushConfigured() {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export function saveSubscription(subscription, userAgent = "") {
  const db = getDb();
  const keys = subscription?.keys || {};
  if (!subscription?.endpoint || !keys.p256dh || !keys.auth) {
    throw new Error("Invalid push subscription");
  }

  db.prepare(`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, last_seen_at)
    VALUES (@endpoint, @p256dh, @auth, @user_agent, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).run({
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent
  });
}

export function deleteSubscription(endpoint) {
  return getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export async function sendPushToAll(payload) {
  if (!pushConfigured()) return { sent: 0, failed: 0, skipped: true };
  const db = getDb();
  const subscriptions = db.prepare("SELECT * FROM push_subscriptions ORDER BY created_at DESC").all();
  let sent = 0;
  let failed = 0;

  for (const row of subscriptions) {
    const subscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth }
    };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error.statusCode === 404 || error.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
      } else {
        console.error("Push delivery failed", error.message);
      }
    }
  }

  return { sent, failed, skipped: false };
}
