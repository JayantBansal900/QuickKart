const fs = require('fs');
const path = require('path');

const canonicalCategories = new Set([
  'Electronics',
  'Fashion',
  'Home & Living',
  'Sports',
  'Books',
  'Beauty',
  'Groceries',
  'Accessories'
]);

// Single source of truth: the catalog the product service seeds from.
const catalogPath = path.join(__dirname, '../../backend/services/product-service/src/main/resources/catalog.json');
const publicProductsDir = path.join(__dirname, '../public');

if (!fs.existsSync(catalogPath)) {
  console.error(`❌ Validation Failed: catalog.json not found at ${catalogPath}`);
  process.exit(1);
}

const rawData = fs.readFileSync(catalogPath, 'utf8');
const products = JSON.parse(rawData);

console.log(`==================================================`);
console.log(`QUICKKART CATALOG & IMAGE ASSETS VALIDATOR`);
console.log(`==================================================`);
console.log(`Checking catalog dataset at: ${catalogPath}`);
console.log(`Total Products in Catalog: ${products.length}`);

let errors = 0;
let warnings = 0;

const seenSkus = new Set();
const seenIds = new Set();
const categoryCounts = {};

products.forEach((p, idx) => {
  const itemRef = `Product #${idx + 1} (${p.name || 'UNNAMED'})`;

  // 1. Required fields
  if (!p.name || !p.name.trim()) {
    console.error(`❌ ${itemRef}: Missing product name.`);
    errors++;
  }
  if (!p.brand || !p.brand.trim()) {
    console.error(`❌ ${itemRef}: Missing brand.`);
    errors++;
  }
  if (p.price === undefined || p.price === null || isNaN(p.price) || p.price <= 0) {
    console.error(`❌ ${itemRef}: Invalid price (${p.price}).`);
    errors++;
  }
  if (p.stockQuantity === undefined || p.stockQuantity === null || isNaN(p.stockQuantity) || p.stockQuantity < 0) {
    console.error(`❌ ${itemRef}: Invalid stockQuantity (${p.stockQuantity}).`);
    errors++;
  }

  // 2. Canonical categories
  if (!p.category || !canonicalCategories.has(p.category)) {
    console.error(`❌ ${itemRef}: Non-canonical category '${p.category}'. Must be one of: ${Array.from(canonicalCategories).join(', ')}.`);
    errors++;
  } else {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }

  // 3. Unique SKU
  if (!p.sku || !p.sku.trim()) {
    console.error(`❌ ${itemRef}: Missing SKU.`);
    errors++;
  } else if (seenSkus.has(p.sku)) {
    console.error(`❌ ${itemRef}: Duplicate SKU '${p.sku}'.`);
    errors++;
  } else {
    seenSkus.add(p.sku);
  }

  // 4. Image Path & Physical File Existence
  if (!p.imageUrl) {
    console.error(`❌ ${itemRef}: Missing imageUrl.`);
    errors++;
  } else {
    if (p.imageUrl.startsWith('http://') || p.imageUrl.startsWith('https://')) {
      console.error(`❌ ${itemRef}: External runtime image URL detected (${p.imageUrl}). Must be local relative path.`);
      errors++;
    }

    if (!p.imageUrl.startsWith('/products/')) {
      console.error(`❌ ${itemRef}: Image URL '${p.imageUrl}' does not start with '/products/'.`);
      errors++;
    }

    const physicalPath = path.join(publicProductsDir, p.imageUrl);
    if (!fs.existsSync(physicalPath)) {
      console.error(`❌ ${itemRef}: Physical image file missing on disk at '${physicalPath}'.`);
      errors++;
    }
  }

  // 5. Valid numerical ranges
  if (p.discountPercentage !== undefined && (p.discountPercentage < 0 || p.discountPercentage > 100)) {
    console.error(`❌ ${itemRef}: Invalid discountPercentage (${p.discountPercentage}).`);
    errors++;
  }
  if (p.rating !== undefined && (p.rating < 0 || p.rating > 5.0)) {
    console.error(`❌ ${itemRef}: Invalid rating (${p.rating}).`);
    errors++;
  }
});

console.log(`\n--- Category Breakdown ---`);
Object.keys(categoryCounts).sort().forEach((cat) => {
  console.log(`  - ${cat}: ${categoryCounts[cat]} items`);
});

console.log(`\n==================================================`);
console.log(`VALIDATION SUMMARY:`);
console.log(`  Total Products Validated: ${products.length}`);
console.log(`  Unique SKUs: ${seenSkus.size}`);
console.log(`  Total Categories Covered: ${Object.keys(categoryCounts).length} / 8`);
console.log(`  Total Errors: ${errors}`);
console.log(`  Total Warnings: ${warnings}`);
console.log(`==================================================`);

if (errors > 0) {
  console.error(`\n❌ Catalog Validation FAILED with ${errors} errors.`);
  process.exit(1);
} else {
  console.log(`\n✅ Catalog Validation PASSED 100%! All local image assets exist and data schemas are clean.`);
  process.exit(0);
}
