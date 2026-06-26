import {
  cleanSeller,
  extractLdJson,
  fetchPage,
  findPriceInText,
  normalizeAvailability,
  textIncludesAny,
  unknown
} from "./shared.js";

export async function checkTarget(product) {
  let page;
  try {
    page = await fetchPage(product.product_url);
  } catch (error) {
    return unknown(`Target fetch failed: ${error.message}`);
  }

  if (!page.ok) {
    return unknown(`Target returned HTTP ${page.statusCode}`);
  }

  const html = page.html;
  const nodes = extractLdJson(html);
  const productNode = nodes.find((node) => {
    const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : node["@type"];
    return String(type || "").toLowerCase().includes("product");
  });

  const offers = Array.isArray(productNode?.offers) ? productNode.offers[0] : productNode?.offers;
  const ldAvailability = normalizeAvailability(offers?.availability);
  const ldPrice = offers?.price ? Number(offers.price) : null;
  const seller = cleanSeller(offers?.seller?.name || offers?.seller || "Target");

  const pageSaysUnavailable = textIncludesAny(html, [
    "out of stock",
    "sold out",
    "currently unavailable",
    "not available"
  ]);
  const shippingSignal = textIncludesAny(html, [
    "ship it",
    "shipping",
    "delivery",
    "add to cart"
  ]);
  const pageSaysAvailable = textIncludesAny(html, [
    "in stock",
    "add to cart",
    "ship it"
  ]);

  const price = Number.isFinite(ldPrice) ? ldPrice : findPriceInText(html);
  const inStock = ldAvailability === true || (ldAvailability === null && pageSaysAvailable && !pageSaysUnavailable);
  const onlineAvailable = inStock && shippingSignal && !pageSaysUnavailable;

  if (price === null || (!productNode && !pageSaysUnavailable && !pageSaysAvailable)) {
    return unknown("Target page did not expose enough stable stock data", `http=${page.statusCode}`);
  }

  if (pageSaysUnavailable || ldAvailability === false) {
    return {
      status: "out_of_stock",
      in_stock: false,
      online_available: false,
      price,
      seller,
      confidence: productNode ? "medium" : "low",
      message: "Target indicates the item is unavailable",
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
      message: "Target stock may be local-only or shipping availability was unclear",
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
    message: "Target page indicates online availability",
    raw_summary: `ld=${Boolean(productNode)}`
  };
}
