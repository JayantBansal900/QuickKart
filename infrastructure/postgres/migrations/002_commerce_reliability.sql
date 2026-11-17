-- Apply once with both commerce writers stopped. No existing rows are rewritten.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_key VARCHAR(80);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(1000);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_phone VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(255);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uk_orders_user_checkout ON orders(user_id,checkout_key);
-- Legacy NULL keys remain compatible; no inferred payment, title or inventory history is backfilled.
