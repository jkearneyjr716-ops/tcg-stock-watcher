# TCG Stock Watcher

Private Railway-deployable web app for personal Pokemon TCG stock alerts from selected Target and Walmart product pages.

This app sends iPhone web push notifications only when a watched product is enabled, appears in stock, appears available for online purchase or shipping, has a known price at or below your max price, matches the approved seller rule, and is outside its alert cooldown.

It intentionally does not include auto-cart, checkout automation, account login automation, CAPTCHA bypass, proxy support, or retailer system circumvention.

## Features

- Password-protected dashboard using `ADMIN_PASSWORD`
- Add, edit, delete, pause, resume, and manually check watched products
- SQLite persistence for products, subscriptions, alerts, and status checks
- Server-side scanner with polite intervals, jitter, and crash-safe error logging
- iPhone Home Screen web push via VAPID and the `web-push` package
- Target and Walmart checker modules that prefer structured page data and return `unknown` when confidence is low
- Mobile-first pages for products, push setup, alert history, and logs

## Local Setup

1. Install Node.js 20 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy environment settings:

   ```bash
   cp .env.example .env
   ```

4. Generate VAPID keys:

   ```bash
   npx web-push generate-vapid-keys
   ```

5. Fill in `.env`. For local development, set `DATABASE_PATH=./data/tcg-stock-watcher.sqlite`.
6. Run migrations:

   ```bash
   npm run migrate
   ```

7. Start the app:

   ```bash
   npm run dev
   ```

8. Open `http://localhost:3000`.

## iPhone Web Push Setup

1. Deploy the app to an HTTPS URL.
2. Open the site in Safari on iPhone.
3. Tap Share, then Add to Home Screen.
4. Open the installed Home Screen app.
5. Log in and go to Push.
6. Tap Enable push.
7. Tap Test push notification.

iOS web push requires the Home Screen app flow. Normal Safari tabs cannot receive web push notifications.

## Railway Deployment

1. Push this project to GitHub.
2. Create a new Railway project from the GitHub repo.
3. Add a persistent Railway volume.
4. Mount the volume at `/data`.
5. Set these Railway variables:

   ```text
   ADMIN_PASSWORD=your-long-private-password
   SESSION_SECRET=your-long-random-session-secret
   DATABASE_PATH=/data/tcg-stock-watcher.sqlite
   VAPID_PUBLIC_KEY=your-public-key
   VAPID_PRIVATE_KEY=your-private-key
   VAPID_SUBJECT=mailto:you@example.com
   SCAN_DEFAULT_INTERVAL_SECONDS=900
   TARGET_STORE_ID=2170
   TARGET_ZIP=08332
   TARGET_STATE=NJ
   TARGET_LATITUDE=39.330
   TARGET_LONGITUDE=-75.040
   NODE_ENV=production
   ```

6. Deploy. This repo pins Railway/Nixpacks to Node 20 in `.nvmrc`, `package.json`, and `nixpacks.toml`. `railway.json` runs `npm run migrate && npm start`.
7. Confirm `/health` returns `{ "ok": true }`.

## Adding Products

- Use direct product pages from Target or Walmart.
- Set `approved_seller` to `Target`, `Walmart`, or leave blank.
- For Walmart first-party filtering, set `approved_seller` to `Walmart`.
- Keep intervals polite. The app enforces a 300 second minimum interval and adds jitter.

## Known Limitations

Target and Walmart change page markup frequently and may render availability dynamically. The Target checker uses Target's public RedSky product and fulfillment responses for price and online shipping stock, then falls back to page data only when confidence is adequate. Unknown statuses never trigger alerts.

Target fulfillment depends on a store/ZIP context. Set `TARGET_STORE_ID`, `TARGET_ZIP`, `TARGET_STATE`, `TARGET_LATITUDE`, and `TARGET_LONGITUDE` to the area you want Target shipping availability checked against.

Playwright is intentionally not installed by default. If a specific watched page cannot expose useful server-rendered data, add Playwright later as a narrowly scoped fallback for that checker. Keep the same alert rule and return `unknown` when confidence is low.

Some pages may show local pickup availability without online shipping. Those are treated as `unknown` unless online purchase or shipping signals are visible.

The scanner is designed for a small personal watch list. It is not a high-frequency scraper and does not use proxies, CAPTCHA bypasses, login sessions, or automated checkout behavior.

## File Tree

```text
.
├── .env.example
├── README.md
├── package.json
├── railway.json
├── public
│   ├── app.js
│   ├── icon.svg
│   ├── manifest.webmanifest
│   ├── styles.css
│   └── sw.js
└── src
    ├── checkers
    │   ├── index.js
    │   ├── shared.js
    │   ├── target.js
    │   └── walmart.js
    ├── config.js
    ├── db.js
    ├── migrate.js
    ├── push.js
    ├── scanner.js
    ├── server.js
    ├── utils
    │   └── html.js
    └── views.js
```
