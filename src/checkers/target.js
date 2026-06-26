import {
  cleanSeller,
  extractLdJson,
  fetchPage,
  fetchJson,
  getPrimaryOffer,
  normalizePrice,
  normalizeAvailability,
  textIncludesAny,
  unknown
} from "./shared.js";
import { config } from "../config.js";

export async function checkTarget(product) {
  const apiResult = await checkTargetRedsky(product);
  if (apiResult) return apiResult;

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

async function checkTargetRedsky(product) {
  const tcin = extractTargetTcin(product.product_url);
  if (!tcin || !config.targetRedskyKey) return null;

  let productJson;
  let fulfillmentJson;
  try {
    productJson = await fetchJson(buildRedskyUrl("pdp_client_v1", tcin));
    fulfillmentJson = await fetchJson(buildRedskyUrl("product_fulfillment_v1", tcin));
  } catch (error) {
    return unknown(`Target RedSky fetch failed: ${error.message}`);
  }

  if (!productJson.ok || !fulfillmentJson.ok) {
    return null;
  }

  const targetProduct = productJson.json?.data?.product;
  const fulfillment = fulfillmentJson.json?.data?.product?.fulfillment;
  const price = normalizePrice(
    targetProduct?.price?.current_retail ||
      targetProduct?.price?.reg_retail ||
      targetProduct?.price?.formatted_current_price
  );
  const seller = "Target";
  const shipping = fulfillment?.shipping_options;
  const shippingStatus = String(shipping?.availability_status || "").toUpperCase();
  const shippingQty = Number(shipping?.available_to_promise_quantity || 0);
  const services = Array.isArray(shipping?.services) ? shipping.services : [];

  if (!targetProduct || !fulfillment || price === null || !shippingStatus) {
    return unknown("Target RedSky response was missing price or fulfillment data", `tcin=${tcin}`);
  }

  if (shippingStatus === "OUT_OF_STOCK" || shippingStatus === "UNAVAILABLE" || shippingQty <= 0) {
    return {
      status: "out_of_stock",
      in_stock: false,
      online_available: false,
      price,
      seller,
      confidence: "high",
      message: `Target shipping status is ${shippingStatus || "unavailable"}`,
      raw_summary: `redsky=true tcin=${tcin} shipping=${shippingStatus} qty=${shippingQty}`
    };
  }

  if (shippingStatus !== "IN_STOCK" || services.length === 0) {
    return {
      status: "unknown",
      in_stock: false,
      online_available: false,
      price,
      seller,
      confidence: "low",
      message: `Target shipping status was not clearly online-purchasable: ${shippingStatus}`,
      raw_summary: `redsky=true tcin=${tcin} shipping=${shippingStatus} qty=${shippingQty}`
    };
  }

  return {
    status: "in_stock",
    in_stock: true,
    online_available: true,
    price,
    seller,
    confidence: "high",
    message: "Target RedSky shipping fulfillment is in stock",
    raw_summary: `redsky=true tcin=${tcin} shipping=${shippingStatus} qty=${shippingQty}`
  };
}

function buildRedskyUrl(endpoint, tcin) {
  const params = new URLSearchParams({
    key: config.targetRedskyKey,
    tcin,
    store_id: config.targetStoreId,
    zip: config.targetZip,
    state: config.targetState,
    latitude: config.targetLatitude,
    longitude: config.targetLongitude,
    scheduled_delivery_store_id: config.targetStoreId,
    pricing_store_id: config.targetStoreId,
    has_pricing_store_id: "true",
    is_bot: "false"
  });
  return `https://redsky.target.com/redsky_aggregations/v1/web/${endpoint}?${params.toString()}`;
}

function extractTargetTcin(url) {
  const match = String(url).match(/\/A-([0-9]+)/i);
  return match ? match[1] : null;
}
