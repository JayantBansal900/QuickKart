# Catalog

QuickKart sells only its own brand: 30 products in three categories (Clothing, Shoes, Accessories).

| File | What it is |
|---|---|
| `scripts/catalog/design-products.mjs` | Draws every product image (flat SVG illustrations in one house style, each carrying the QuickKart logo), the three category tiles, and writes `catalog.json`. No third-party photos are used. |
| `backend/services/product-service/src/main/resources/catalog.json` | The 30 products with sizes and colours. **Generated**: edit `design-products.mjs`, then run it. Seeded by product-service in the `dev` profile when `DEV_PRODUCTS_ENABLED=true`; existing SKUs are never overwritten. |
| `frontend/public/products/qk/*.webp` | The product images (800×800). |
| `frontend/public/categories/*.webp` | The category tiles. |
| `frontend/scripts/validate-catalog.cjs` | CI check: categories, unique SKUs, every image exists, sizes add up to the stock. |

```bash
cd frontend && npm i --no-save sharp && cd ..
node scripts/catalog/design-products.mjs
cd frontend && node scripts/validate-catalog.cjs
```

Ratings are not invented: products start without a rating, and the rating comes from real customer reviews.
