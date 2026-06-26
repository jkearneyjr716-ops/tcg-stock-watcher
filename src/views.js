import { config } from "./config.js";
import { escapeHtml, formatTime, money, statusClass } from "./utils/html.js";
import { pushConfigured } from "./push.js";
import { isPaused, sellerMatches } from "./scanner.js";

export function layout({ title, body, authed = true }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#111827">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="stylesheet" href="/styles.css">
  <title>${escapeHtml(title)} - TCG Stock Watcher</title>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/">TCG Stock Watcher</a>
    ${authed ? `<nav>
      <a href="/">Products</a>
      <a href="/push">Push</a>
      <a href="/alerts">Alerts</a>
      <a href="/logs">Logs</a>
      <form method="post" action="/logout"><button class="linklike">Logout</button></form>
    </nav>` : ""}
  </header>
  <main>${body}</main>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

export function loginPage(error = "") {
  return layout({
    title: "Login",
    authed: false,
    body: `<section class="panel login">
      <h1>Private Dashboard</h1>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
      <form method="post" action="/login" class="stack">
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="primary" type="submit">Login</button>
      </form>
    </section>`
  });
}

export function productListPage(products) {
  const paused = isPaused();
  return layout({
    title: "Products",
    body: `<section class="toolbar">
      <div>
        <h1>Products</h1>
        <p class="muted">Personal alerts only. No cart, checkout, login automation, CAPTCHA bypass, proxies, or retailer system circumvention.</p>
      </div>
      <div class="actions">
        <form method="post" action="/scanner/${paused ? "resume" : "pause"}"><button class="secondary" type="submit">${paused ? "Resume scanning" : "Pause scanning"}</button></form>
        <a class="button primary" href="/products/new">Add product</a>
      </div>
    </section>
    <section class="grid">
      ${products.map(productCard).join("") || `<article class="panel"><p>No products yet.</p></article>`}
    </section>`
  });
}

function productCard(product) {
  const under = product.last_price !== null && Number(product.last_price) <= Number(product.max_price);
  const hasPrice = product.last_price !== null && product.last_price !== undefined;
  const sellerOk = sellerMatches(product.approved_seller, product.last_seller);
  return `<article class="card">
    <div class="row spread">
      <h2>${escapeHtml(product.name)}</h2>
      <span class="badge ${statusClass(product.last_status)}">${escapeHtml(product.last_status)}</span>
    </div>
    <p class="muted">${escapeHtml(product.store)} · checked ${formatTime(product.last_checked_at)}</p>
    <dl>
      <div><dt>Price</dt><dd>${money(product.last_price)} / max ${money(product.max_price)}</dd></div>
      <div><dt>Price rule</dt><dd><span class="badge ${hasPrice && under ? "green" : "yellow"}">${hasPrice ? (under ? "under max price" : "over max price") : "price unknown"}</span></dd></div>
      <div><dt>Seller</dt><dd>${escapeHtml(product.last_seller || "Unknown")}</dd></div>
      <div><dt>Seller rule</dt><dd><span class="badge ${sellerOk ? "green" : "red"}">${sellerOk ? "seller match" : "seller mismatch"}</span></dd></div>
    </dl>
    <div class="actions">
      <form method="post" action="/products/${product.id}/check"><button type="submit">Check now</button></form>
      <a class="button secondary" href="/products/${product.id}/edit">Edit</a>
      <a class="button secondary" href="${escapeHtml(product.product_url)}" target="_blank" rel="noreferrer">Open</a>
    </div>
  </article>`;
}

export function productFormPage(product = null) {
  const isEdit = Boolean(product);
  const value = (name, fallback = "") => escapeHtml(product?.[name] ?? fallback);
  return layout({
    title: isEdit ? "Edit Product" : "Add Product",
    body: `<section class="panel">
      <h1>${isEdit ? "Edit product" : "Add product"}</h1>
      <form method="post" action="${isEdit ? `/products/${product.id}` : "/products"}" class="form-grid">
        <label>Name<input name="name" required value="${value("name")}"></label>
        <label>Store<select name="store">
          <option value="target" ${product?.store === "target" ? "selected" : ""}>Target</option>
          <option value="walmart" ${product?.store === "walmart" ? "selected" : ""}>Walmart</option>
        </select></label>
        <label>Product URL<input name="product_url" type="url" required value="${value("product_url")}"></label>
        <label>Max price<input name="max_price" type="number" min="0" step="0.01" required value="${value("max_price")}"></label>
        <label>Approved seller<input name="approved_seller" placeholder="Blank allows any seller" value="${value("approved_seller")}"></label>
        <label>Check interval seconds<input name="check_interval_seconds" type="number" min="${config.minIntervalSeconds}" step="60" value="${value("check_interval_seconds", config.scanDefaultIntervalSeconds)}"></label>
        <label>Alert cooldown minutes<input name="alert_cooldown_minutes" type="number" min="1" step="1" value="${value("alert_cooldown_minutes", 60)}"></label>
        <label class="check"><input name="enabled" type="checkbox" ${product?.enabled === 0 ? "" : "checked"}> Enabled</label>
        <label class="wide">Notes<textarea name="notes" rows="4">${value("notes")}</textarea></label>
        <div class="actions wide">
          <button class="primary" type="submit">Save</button>
          <a class="button secondary" href="/">Cancel</a>
          ${isEdit ? `<button class="danger" formaction="/products/${product.id}/delete" formmethod="post" type="submit">Delete</button>` : ""}
        </div>
      </form>
    </section>`
  });
}

export function pushPage(subscriptions) {
  return layout({
    title: "Push Setup",
    body: `<section class="panel">
      <h1>iPhone Web Push</h1>
      <p class="muted">On iPhone, open this site in Safari, Share, Add to Home Screen, then open the Home Screen app and enable push.</p>
      <p><span class="badge ${pushConfigured() ? "green" : "red"}">${pushConfigured() ? "VAPID configured" : "VAPID missing"}</span></p>
      <div class="actions">
        <button class="primary" id="enablePush" type="button">Enable push</button>
        <button class="secondary" id="testPush" type="button">Test push notification</button>
        <button class="danger" id="disablePush" type="button">Unsubscribe this device</button>
      </div>
      <pre id="pushStatus" class="statusbox">Ready.</pre>
    </section>
    <section class="panel">
      <h2>Saved subscriptions</h2>
      <p class="muted">${subscriptions.length} device subscription(s)</p>
    </section>`
  });
}

export function alertsPage(alerts) {
  return layout({
    title: "Alert History",
    body: `<section class="panel">
      <h1>Alert History</h1>
      <div class="list">
      ${alerts.map((alert) => `<article class="item">
        <strong>${escapeHtml(alert.title)}</strong>
        <p>${escapeHtml(alert.body)}</p>
        <p class="muted">${formatTime(alert.sent_at)} · ${escapeHtml(alert.delivery_status)}</p>
      </article>`).join("") || "<p>No alerts yet.</p>"}
      </div>
    </section>`
  });
}

export function logsPage(checks) {
  return layout({
    title: "Status Log",
    body: `<section class="panel">
      <h1>Status Log</h1>
      <div class="list">
      ${checks.map((check) => `<article class="item">
        <div class="row spread"><strong>${escapeHtml(check.product_name)}</strong><span class="badge ${statusClass(check.status)}">${escapeHtml(check.status)}</span></div>
        <p>${escapeHtml(check.message || "")}</p>
        <p class="muted">${formatTime(check.checked_at)} · ${money(check.price)} · ${escapeHtml(check.seller || "seller unknown")} · confidence ${escapeHtml(check.confidence)}</p>
      </article>`).join("") || "<p>No status checks yet.</p>"}
      </div>
    </section>`
  });
}
