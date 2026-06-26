import { checkTarget } from "./target.js";
import { checkWalmart } from "./walmart.js";
import { unknown } from "./shared.js";

export async function checkProduct(product) {
  if (product.store === "target") return checkTarget(product);
  if (product.store === "walmart") return checkWalmart(product);
  return unknown(`Unsupported store: ${product.store}`);
}
