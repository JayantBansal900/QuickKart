-- VAYU: the store is now a men's clothing brand.
-- The earlier general-store products stay in the database (past orders point at them) but are
-- discontinued, so they leave the storefront. The VAYU catalog is seeded by product-service.
UPDATE products
SET availability = 'DISCONTINUED'
WHERE (sku IS NULL OR sku NOT LIKE 'VY-%')
  AND COALESCE(UPPER(availability), '') <> 'DISCONTINUED';

DELETE FROM categories
WHERE UPPER(name) IN ('ELECTRONICS', 'FASHION', 'HOME & LIVING', 'SPORTS', 'BOOKS', 'BEAUTY', 'GROCERIES');

UPDATE categories
SET description = 'Belts, wallets, caps, watches and more', image_url = '/categories/vayu-accessories.webp', sort_order = 80, active = true
WHERE UPPER(name) = 'ACCESSORIES';

INSERT INTO categories (name, description, image_url, sort_order)
SELECT v.name, v.description, v.image_url, v.sort_order
FROM (VALUES
    ('T-Shirts',              'Crew, polo, henley and oversized tees',        '/categories/t-shirts.webp',        10),
    ('Shirts',                'Oxford, linen, flannel and formal shirts',     '/categories/shirts.webp',          20),
    ('Jeans',                 'Slim, straight, relaxed and tapered denim',    '/categories/jeans.webp',           30),
    ('Trousers',              'Chinos, cargos, joggers and formal trousers',  '/categories/trousers.webp',        40),
    ('Jackets',               'Bombers, denim, puffers and blazers',          '/categories/jackets.webp',         50),
    ('Hoodies & Sweatshirts', 'Hoodies, sweatshirts and knitwear',            '/categories/hoodies.webp',         60),
    ('Footwear',              'Sneakers, loafers, boots and slides',          '/categories/footwear.webp',        70)
) AS v(name, description, image_url, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE UPPER(c.name) = UPPER(v.name));
