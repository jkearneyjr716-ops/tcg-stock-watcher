export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function money(value) {
  if (value === null || value === undefined || value === "") return "Unknown";
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unknown";
  return number.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatTime(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function statusClass(status) {
  if (status === "in_stock") return "green";
  if (status === "out_of_stock") return "red";
  if (status === "paused") return "yellow";
  return "yellow";
}
