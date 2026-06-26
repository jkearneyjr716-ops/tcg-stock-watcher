export const config = {
  port: Number(process.env.PORT || 3000),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
  databasePath: process.env.DATABASE_PATH || "./data/tcg-stock-watcher.sqlite",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  scanDefaultIntervalSeconds: Number(process.env.SCAN_DEFAULT_INTERVAL_SECONDS || 900),
  minIntervalSeconds: 300,
  requestTimeoutMs: 18000
};
