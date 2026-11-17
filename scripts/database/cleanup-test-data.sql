-- =============================================================================
-- QuickKart: remove test/legacy data that leaked into the development database.
--
-- DRY RUN BY DEFAULT. Everything runs in ONE transaction that is ROLLED BACK
-- unless you pass -v apply=1. Always take a pg_dump first.
--
--   Dry run (changes nothing, prints what WOULD be removed):
--     docker exec -i quickkart-postgres psql -U postgres -d quickkart -v ON_ERROR_STOP=1 < scripts/database/cleanup-test-data.sql
--   Apply (after reviewing the dry run and taking a backup):
--     docker exec -i quickkart-postgres psql -U postgres -d quickkart -v ON_ERROR_STOP=1 -v apply=1 < scripts/database/cleanup-test-data.sql
--
-- KEEPS
--   * the 535 catalog products (SKU-<CATEGORY>-NNN, identical to catalog.json)
--   * every ADMIN account
--   * real-looking customer accounts (anything NOT matching the test patterns below)
-- REMOVES
--   * test-artifact products (Cache Test Keyboard…, Docker Test Laptop…, Limited Edition
--     Smartphone, E2E/Concurrency/Sentinel/Exclusive test items, timestamp-suffixed items)
--   * legacy products without a SKU (an older duplicate catalog, ids 211–664)
--   * test customer accounts, plus their carts, orders, order items, payments and OTP rows
-- =============================================================================
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- ---------- 1. Decide what is test data (written once, reused below) ----------
CREATE TEMP TABLE cleanup_users ON COMMIT DROP AS
SELECT id, email FROM users
WHERE role = 'USER'
  AND (
        email ~* '@(test\.com|example\.com|example\.invalid|quickkart\.test)$'
     OR email ~* '^(concurrent_[a-z0-9]+|verifuser[0-9_]*|bench_[a-z0-9_]+)@quickkart\.com$'
  );

CREATE TEMP TABLE cleanup_products ON COMMIT DROP AS
SELECT id, name, CASE WHEN sku IS NULL AND id BETWEEN 211 AND 664
                      AND name !~* '(test|limited edition smartphone|[0-9]{10,})' THEN 'legacy' ELSE 'test' END AS reason
FROM products
-- "sku IS NULL OR" matters: NOT (NULL ~ ...) is NULL, which would silently skip every SKU-less row.
WHERE sku IS NULL OR NOT (sku ~ '^SKU-(ELEC|FASH|HOME|SPOR|BOOK|BEAU|GROC|ACCE)-[0-9]{3}$');

CREATE TEMP TABLE cleanup_orders ON COMMIT DROP AS
SELECT DISTINCT o.id FROM orders o
WHERE o.user_id IN (SELECT id FROM cleanup_users)
   OR o.id IN (SELECT order_id FROM order_items WHERE product_id IN (SELECT id FROM cleanup_products));

-- Safety: an order of a KEPT user that contains a removed product would be deleted too.
-- Abort instead of silently deleting a real customer's order.
DO $$
DECLARE kept_orders int;
BEGIN
  SELECT count(*) INTO kept_orders FROM orders
   WHERE id IN (SELECT id FROM cleanup_orders) AND user_id NOT IN (SELECT id FROM cleanup_users);
  IF kept_orders > 0 THEN
    RAISE EXCEPTION 'Aborting: % order(s) of non-test users reference products scheduled for removal', kept_orders;
  END IF;
END $$;

\echo '=== What will be removed ==='
SELECT 'users' AS what, count(*) FROM cleanup_users
UNION ALL SELECT 'products (' || reason || ')', count(*) FROM cleanup_products GROUP BY reason
UNION ALL SELECT 'orders', count(*) FROM cleanup_orders
UNION ALL SELECT 'order_items', count(*) FROM order_items WHERE order_id IN (SELECT id FROM cleanup_orders)
UNION ALL SELECT 'payments', count(*) FROM payments WHERE order_id IN (SELECT id FROM cleanup_orders)
UNION ALL SELECT 'carts', count(*) FROM carts WHERE user_id IN (SELECT id FROM cleanup_users)
UNION ALL SELECT 'cart_items', count(*) FROM cart_items
          WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (SELECT id FROM cleanup_users))
             OR product_id IN (SELECT id FROM cleanup_products)
UNION ALL SELECT 'email_verifications', count(*) FROM email_verifications WHERE email IN (SELECT email FROM cleanup_users);

\echo '=== Accounts that will be KEPT ==='
SELECT id, email, role, account_status, email_verified FROM users
WHERE id NOT IN (SELECT id FROM cleanup_users) ORDER BY role, id;

-- ---------- 2. Delete children before parents (foreign keys) ----------
DELETE FROM order_items WHERE order_id IN (SELECT id FROM cleanup_orders);
DELETE FROM payments    WHERE order_id IN (SELECT id FROM cleanup_orders);
DELETE FROM orders      WHERE id IN (SELECT id FROM cleanup_orders);
DELETE FROM cart_items  WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (SELECT id FROM cleanup_users))
                           OR product_id IN (SELECT id FROM cleanup_products);
DELETE FROM carts       WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM email_verifications WHERE email IN (SELECT email FROM cleanup_users);
DELETE FROM users       WHERE id IN (SELECT id FROM cleanup_users);
DELETE FROM products    WHERE id IN (SELECT id FROM cleanup_products);

\echo '=== Totals AFTER cleanup (inside the transaction) ==='
SELECT (SELECT count(*) FROM products) AS products,
       (SELECT count(*) FROM products WHERE availability IS NULL) AS products_null_availability,
       (SELECT count(*) FROM products WHERE coalesce(image_url, '') = '') AS products_without_image,
       (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM orders) AS orders;

\if :apply
  COMMIT;
  \echo 'APPLIED. Next: clear the catalog cache:  docker exec quickkart-redis redis-cli --scan --pattern "quickkart:product*" | xargs docker exec quickkart-redis redis-cli DEL   (or wait 60s / 5 min for TTLs)'
\else
  ROLLBACK;
  \echo 'DRY RUN ONLY - nothing was changed. Re-run with -v apply=1 to apply.'
\endif
