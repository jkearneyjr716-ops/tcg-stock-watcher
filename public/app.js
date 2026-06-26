function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Web push is not supported in this browser.");
  }
  return navigator.serviceWorker.register("/sw.js");
}

async function enablePush() {
  const status = document.querySelector("#pushStatus");
  status.textContent = "Registering service worker...";
  const registration = await registerServiceWorker();
  const keyResponse = await fetch("/api/vapid-public-key");
  const { publicKey, configured } = await keyResponse.json();
  if (!configured || !publicKey) throw new Error("VAPID keys are not configured on the server.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  await fetch("/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription)
  });
  status.textContent = "Push is enabled for this device.";
}

async function disablePush() {
  const status = document.querySelector("#pushStatus");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    status.textContent = "This device has no active subscription.";
    return;
  }
  await fetch("/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  await subscription.unsubscribe();
  status.textContent = "This device has been unsubscribed.";
}

async function testPush() {
  const status = document.querySelector("#pushStatus");
  const response = await fetch("/test-push", { method: "POST" });
  const json = await response.json();
  status.textContent = JSON.stringify(json, null, 2);
}

for (const [selector, handler] of [
  ["#enablePush", enablePush],
  ["#disablePush", disablePush],
  ["#testPush", testPush]
]) {
  const button = document.querySelector(selector);
  if (button) {
    button.addEventListener("click", async () => {
      try {
        await handler();
      } catch (error) {
        document.querySelector("#pushStatus").textContent = error.message;
      }
    });
  }
}
