-- For an EXISTING database, after migration V11: deletes the products QuickKart no longer sells
-- (any SKU that is not QK-...) when no order ever included them. Products that appear in past
-- orders stay in the table as DISCONTINUED, so order history still shows them.
-- Their cart lines are removed (carts are temporary); reviews, wishlist entries, sizes and stock
-- history go with the product (ON DELETE CASCADE).
--
-- Take a backup first:
--   docker exec quickkart-postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
-- Then:
--   docker exec -i quickkart-postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -v ON_ERROR_STOP=1' < scripts/database/remove-retired-products.sql
BEGIN;

DELETE FROM cart_items
WHERE product_id IN (SELECT id FROM products WHERE sku IS NULL OR sku NOT LIKE 'QK-%');

DELETE FROM products p
WHERE (p.sku IS NULL OR p.sku NOT LIKE 'QK-%')
  AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id);

COMMIT;
