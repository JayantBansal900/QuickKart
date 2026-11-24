-- The original seed gave 20 catalog products 0 stock (often the first product of a category, e.g.
-- Sony WH-1000XM5), so a fresh store looked 14 % sold out. catalog.json now stocks them; this applies the
-- same numbers to an existing database. Only rows that are STILL at 0 are changed, so real restocks or
-- sales are never overwritten. Three products stay out of stock on purpose (to demo the badge).
-- Every change is written to the stock history. Safe to re-run.
-- Usage: docker exec -i quickkart-postgres psql -U postgres -d quickkart -v ON_ERROR_STOP=1 < scripts/database/fix-seed-stock.sql
BEGIN;
WITH v(sku, qty) AS (VALUES
  ('SKU-ACCE-001', 35),
  ('SKU-BEAU-001', 30),
  ('SKU-BEAU-017', 27),
  ('SKU-BEAU-025', 16),
  ('SKU-BOOK-001', 32),
  ('SKU-BOOK-011', 23),
  ('SKU-BOOK-021', 14),
  ('SKU-ELEC-001', 36),
  ('SKU-ELEC-015', 31),
  ('SKU-ELEC-043', 42),
  ('SKU-FASH-001', 15),
  ('SKU-FASH-017', 12),
  ('SKU-GROC-001', 14),
  ('SKU-GROC-013', 47),
  ('SKU-GROC-025', 2),
  ('SKU-GROC-037', 3),
  ('SKU-HOME-001', 4)
), changed AS (
  UPDATE products p SET stock_quantity = v.qty,
         availability = CASE WHEN upper(coalesce(p.availability, '')) = 'DISCONTINUED' THEN p.availability ELSE 'IN_STOCK' END
  FROM v WHERE p.sku = v.sku AND p.stock_quantity = 0
  RETURNING p.id, v.qty
)
INSERT INTO stock_movements (product_id, change_quantity, stock_after, reason, reference, actor, created_at)
SELECT id, qty, qty, 'RESTOCK', 'fix-seed-stock.sql', 'system', now() FROM changed;
COMMIT;
