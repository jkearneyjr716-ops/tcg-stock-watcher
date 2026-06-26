export const config = {
  port: Number(process.env.PORT || 3000),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
  databasePath: process.env.DATABASE_PATH || "./data/tcg-stock-watcher.sqlite",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:admin@example.com",
  scanDefaultIntervalSeconds: Number(process.env.SCAN_DEFAULT_INTERVAL_SECONDS || 900),
  targetRedskyKey: process.env.TARGET_REDSKY_KEY || "9f36aeafbe60771e321a7cc95a78140772ab3e96",
  targetStoreId: process.env.TARGET_STORE_ID || "2170",
  targetZip: process.env.TARGET_ZIP || "08332",
  targetState: process.env.TARGET_STATE || "NJ",
  targetLatitude: process.env.TARGET_LATITUDE || "39.330",
  targetLongitude: process.env.TARGET_LONGITUDE || "-75.040",
  minIntervalSeconds: 300,
  requestTimeoutMs: 18000
};
