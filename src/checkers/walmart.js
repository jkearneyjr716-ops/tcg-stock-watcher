import {
  cleanSeller,
  extractLdJson,
  fetchPage,
  findPriceInText,
  normalizeAvailability,
  textIncludesAny,
  unknown
} from "./shared.js";

export async function checkWalmart(product) {
  let page;
  try {
    page = await fetchPage(product.product_url);
  } catch (error) {
    return unknown(`Walmart fetch failed: ${error.message}`);
  }

  if (!page.ok) {
    return unknown(`Walmart returned HTTP ${page.statusCode}`);
  }

  const html = page.html;
  const nodes = extractLdJson(html);
  const productNode = nodes.find((node) => {
    const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : node["@type"];
    return String(type || "").toLowerCase().includes("product");
  });
  const offers = Array.isArray(productNode?.offers) ? productNode.offers[0] : productNode?.offers;

  const ldAvailability = normalizeAvailability(offers?.availability);
  const price = Number.isFinite(Number(offers?.price)) ? Number(offers.price) : findPriceInText(html);
  const seller = cleanSeller(
    offers?.seller?.name ||
      offers?.seller ||
      findSeller(html) ||
      "Walmart"
  );

  const unavailable = textIncludesAny(html, [
    "out of stock",
    "sold out",
    "currently unavailable",
    "not available"
  ]);
  const shippingSignal = textIncludesAny(html, [
    "shipping",
    "delivery",
    "add to cart",
    "arrives"
  ]);
  const available = textIncludesAny(html, ["in stock", "add to cart", "arrives"]);
  const inStock = ldAvailability === true || (ldAvailability === null && available && !unavailable);
  const onlineAvailable = inStock && shippingSignal && !unavailable;

  if (price === null || (!productNode && !available && !unavailable)) {
    return unknown("Walmart page did not expose enough stable stock data", `http=${page.statusCode}`);
  }

  if (unavailable || ldAvailability === false) {
    return {
      status: "out_of_stock",
      in_stock: false,
      online_available: false,
      price,
      seller,
      confidence: productNode ? "medium" : "low",
      message: "Walmart indicates the item is unavailable",
      raw_summary: `ld=${Boolean(productNode)}`
    };
  }

  if (!onlineAvailable) {
    return {
      status: "unknown",
      in_stock: inStock,
      online_available: false,
      price,
      seller,
      confidence: "low",
      message: "Walmart stock may be local-only or shipping availability was unclear",
      raw_summary: `ld=${Boolean(productNode)}`
    };
  }

  return {
    status: "in_stock",
    in_stock: true,
    online_available: true,
    price,
    seller,
    confidence: productNode ? "medium" : "low",
    message: "Walmart page indicates online availability",
    raw_summary: `ld=${Boolean(productNode)}`
  };
}

function findSeller(html) {
  const patterns = [
    /Sold and shipped by\s*([^"<]+)/i,
    /sellerName["']?\s*:\s*["']([^"']+)/i,
    /soldBy["']?\s*:\s*["']([^"']+)/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}
