// Gives the clothes and shoes in catalog.json their sizes (and colours), with the product's stock
// split across them. Safe to run again: products that already have sizes are left alone.
//   node scripts/catalog/add-fashion-sizes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "backend/services/product-service/src/main/resources/catalog.json");
const APPAREL = ["S", "M", "L", "XL", "XXL"];
const WAIST = ["28", "30", "32", "34", "36"];
const SHOES = ["6", "7", "8", "9", "10", "11"];

// SKU → [sizes, colours]
const SIZES = {
  "SKU-FASH-001": [WAIST, ["Indigo"]],
  "SKU-FASH-002": [APPAREL, ["White", "Black"]],
  "SKU-FASH-004": [APPAREL, ["Mid Blue"]],
  "SKU-FASH-005": [SHOES, ["White"]],
  "SKU-FASH-006": [SHOES, ["Black", "Grey"]],
  "SKU-FASH-008": [APPAREL, ["Grey", "Black"]],
  "SKU-FASH-011": [APPAREL, ["Black"]],
  "SKU-FASH-014": [APPAREL, ["Navy", "White"]],
  "SKU-FASH-015": [APPAREL, ["Black"]],
  "SKU-FASH-016": [APPAREL, ["White", "Light Blue"]],
  "SKU-FASH-017": [APPAREL, ["Black"]],
  "SKU-FASH-027": [APPAREL, ["Cream"]],
  "SKU-FASH-029": [APPAREL, ["Champagne"]],
  "SKU-FASH-031": [APPAREL, ["Black", "Navy"]],
  "SKU-FASH-034": [APPAREL, ["Indigo"]],
  "SKU-FASH-045": [APPAREL, ["Black"]],
};

const catalog = JSON.parse(readFileSync(FILE, "utf8"));
let changed = 0;
for (const p of catalog) {
  const spec = SIZES[p.sku];
  if (!spec || p.variants?.length) continue;
  const [sizes, colours] = spec;
  const rows = colours.flatMap((color) => sizes.map((size) => ({ size, color })));
  // Spread the stock evenly; the middle sizes get any remainder, and the last row of a
  // colour is sold out when there is not enough stock to go round (shows the sold-out state).
  const each = Math.floor(p.stockQuantity / rows.length);
  let left = p.stockQuantity - each * rows.length;
  p.variants = rows.map((r, i) => {
    const extra = left > 0 && i % sizes.length >= 1 && i % sizes.length <= 3 ? 1 : 0;
    left -= extra;
    return { ...r, stockQuantity: each + extra };
  });
  const total = p.variants.reduce((s, v) => s + v.stockQuantity, 0);
  if (total !== p.stockQuantity) p.variants[0].stockQuantity += p.stockQuantity - total;
  changed++;
}
writeFileSync(FILE, JSON.stringify(catalog, null, 2) + "\n");
console.log(`sizes added to ${changed} products`);
