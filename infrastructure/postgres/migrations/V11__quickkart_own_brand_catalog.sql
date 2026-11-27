-- QuickKart sells only its own brand now: 30 products in three categories (Clothing, Shoes,
-- Accessories), seeded by product-service from catalog.json (SKUs QK-...).
-- Earlier products are discontinued rather than deleted, because past orders point at them.
UPDATE products
SET availability = 'DISCONTINUED'
WHERE (sku IS NULL OR sku NOT LIKE 'QK-%')
  AND UPPER(COALESCE(availability, '')) <> 'DISCONTINUED';

DELETE FROM categories
WHERE UPPER(name) NOT IN ('CLOTHING', 'SHOES', 'ACCESSORIES');

UPDATE categories
SET description = 'Caps, bags, wallets, belts, watches and sunglasses', image_url = '/categories/accessories.webp', sort_order = 30, active = true
WHERE UPPER(name) = 'ACCESSORIES';

INSERT INTO categories (name, description, image_url, sort_order)
SELECT v.name, v.description, v.image_url, v.sort_order
FROM (VALUES
    ('Clothing',    'Tees, shirts, hoodies, jackets, jeans and more',     '/categories/clothing.webp',    10),
    ('Shoes',       'Sneakers, boots, loafers and slides',                '/categories/shoes.webp',       20),
    ('Accessories', 'Caps, bags, wallets, belts, watches and sunglasses', '/categories/accessories.webp', 30)
) AS v(name, description, image_url, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE UPPER(c.name) = UPPER(v.name));
