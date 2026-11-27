-- Back to the QuickKart general store after the VAYU menswear experiment (V9).
-- Catalog products come back on sale; the VAYU products stay in the database (orders may point
-- at them) but leave the storefront. Size/colour variants (V8) are kept for clothes and shoes.
UPDATE products
SET availability = CASE WHEN stock_quantity > 0 THEN 'IN_STOCK' ELSE 'OUT_OF_STOCK' END
WHERE sku LIKE 'SKU-%'
  AND UPPER(COALESCE(availability, '')) = 'DISCONTINUED';

UPDATE products
SET availability = 'DISCONTINUED'
WHERE sku LIKE 'VY-%';

DELETE FROM categories
WHERE UPPER(name) IN ('T-SHIRTS', 'SHIRTS', 'JEANS', 'TROUSERS', 'JACKETS', 'HOODIES & SWEATSHIRTS', 'FOOTWEAR');

UPDATE categories
SET description = 'Watches, bags, eyewear and more', image_url = '/categories/accessories.webp', sort_order = 80, active = true
WHERE UPPER(name) = 'ACCESSORIES';

INSERT INTO categories (name, description, image_url, sort_order)
SELECT v.name, v.description, v.image_url, v.sort_order
FROM (VALUES
    ('Electronics',   'Phones, audio, laptops and smart devices', '/categories/electronics.webp', 10),
    ('Fashion',       'Clothing, footwear and everyday style',     '/categories/fashion.webp',     20),
    ('Home & Living', 'Kitchen, decor and home essentials',        '/categories/home-living.webp', 30),
    ('Sports',        'Fitness, outdoor and sports gear',          '/categories/sports.webp',      40),
    ('Books',         'Bestsellers, classics and learning',        '/categories/books.webp',       50),
    ('Beauty',        'Skincare, haircare and grooming',           '/categories/beauty.webp',      60),
    ('Groceries',     'Pantry staples, snacks and beverages',      '/categories/groceries.webp',   70),
    ('Accessories',   'Watches, bags, eyewear and more',           '/categories/accessories.webp', 80)
) AS v(name, description, image_url, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE UPPER(c.name) = UPPER(v.name));
