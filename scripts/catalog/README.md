# Catalog data and photos

| File | What it is |
|---|---|
| `backend/services/product-service/src/main/resources/catalog.json` | The 144 products (18 per category): name, brand, price, discount, rating, stock, SKU and photo path. Seeded into an empty database by product-service in the `dev` profile. Clothes and shoes carry `variants` (sizes and colours), added by `scripts/catalog/add-fashion-sizes.mjs`. |
| `scripts/catalog/search-photos.mjs` | Helper that builds contact sheets of Pixabay candidates so photos can be chosen by eye. |
| `frontend/public/products/photos/*.webp` | One 640×640 photo per product type (134 files). |
| `frontend/public/categories/*.webp` | Category tiles and the sign-in panel photo. |
| `scripts/catalog/photo-manifest.json` | Which Pixabay photo (id, photographer, page) each of those files came from. |
| `scripts/catalog/fetch-photos.mjs` | Re-downloads the photos in the manifest and converts them to WebP. |
| `scripts/database/refresh-catalog-details.sql` | Pushes catalog.json names, prices, descriptions and photos into an existing database by SKU. |
| `docs/photo-credits.md` | Photographer credits. |

## How the photos were chosen

Photos come from [Pixabay](https://pixabay.com) (Pixabay Content Licence: free to use, no attribution
required). For each product type the Pixabay search returned a few candidates, and every photo was then
checked by eye: automatic scoring picked wrong images (for example a fighter jet for "air fryer"), so the
final choice was manual. The result of that review is `photo-manifest.json`. The photos show the *type*
of product, not the exact branded item; admins can upload the real product photo from the admin panel.

## Re-creating the photos

```bash
cd frontend && npm i --no-save sharp && cd ..
```

```bash
node scripts/catalog/fetch-photos.mjs
```

It needs `PIXABAY_API_KEY` in `.env` and only downloads files that are missing (`--force` re-downloads all).
Then check that every product points at an existing file:

```bash
cd frontend && node scripts/validate-catalog.cjs
```
