import {
  cleanSeller,
  extractLdJson,
  fetchPage,
  getPrimaryOffer,
  normalizePrice,
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

  const offers = getPrimaryOffer(productNode);
  const ldAvailability = normalizeAvailability(offers?.availability || offers?.itemAvailability);
  const price = normalizePrice(offers?.price || offers?.priceSpecification?.price);
  const seller = cleanSeller(offers?.seller?.name || offers?.seller || "Target");

  const pageSaysUnavailable = textIncludesAny(html, [
    "out of stock",
    "sold out",
    "currently unavailable",
    "not available",
    "temporarily out of stock",
    "preorder sold out"
  ]);
  const shippingSignal = textIncludesAny(html, ["ship it", "shipping", "delivery"]);

  if (!productNode || !offers) {
    if (pageSaysUnavailable) {
      return {
        status: "out_of_stock",
        in_stock: false,
        online_available: false,
        price: null,
        seller,
        confidence: "medium",
        message: "Target page indicates the item is unavailable, but structured offer data was missing",
        raw_summary: `ld=${Boolean(productNode)} offer=${Boolean(offers)}`
      };
    }
    return unknown("Target page did not expose structured product offer data", `http=${page.statusCode}`);
  }

  if (pageSaysUnavailable || ldAvailability === false) {
    return {
      status: "out_of_stock",
      in_stock: false,
      online_available: false,
      price,
      seller,
      confidence: "medium",
      message: "Target indicates the item is unavailable",
      raw_summary: `ld=true offer=true availability=${offers?.availability || ""}`
    };
  }

  if (price === null) {
    return unknown("Target structured offer did not include a trustworthy price", "ld=true offer=true");
  }

  if (ldAvailability !== true) {
    return {
      status: "unknown",
      in_stock: false,
      online_available: false,
      price,
      seller,
      confidence: "low",
      message: "Target structured offer did not explicitly say InStock",
      raw_summary: `ld=true offer=true availability=${offers?.availability || ""}`
    };
  }

  if (!shippingSignal) {
    return {
      status: "unknown",
      in_stock: true,
      online_available: false,
      price,
      seller,
      confidence: "low",
      message: "Target offer appears in stock, but online shipping availability was unclear",
      raw_summary: "ld=true offer=true"
    };
  }

  return {
    status: "in_stock",
    in_stock: true,
    online_available: true,
    price,
    seller,
    confidence: "medium",
    message: "Target structured offer indicates online availability",
    raw_summary: `ld=true offer=true availability=${offers?.availability || ""}`
  };
}
