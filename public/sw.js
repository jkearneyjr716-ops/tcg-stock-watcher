self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "TCG Stock Watcher";
  const options = {
    body: data.body || "A watched product changed status.",
    data: { url: data.url || "/" },
    tag: data.productId ? `product-${data.productId}` : "tcg-stock-watcher",
    requireInteraction: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});
