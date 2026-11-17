# QuickKart Database Schema & Reproducibility

## Architecture Overview

QuickKart microservices (`monolith`, `product-service`, `order-service`) connect to a shared PostgreSQL database (`quickkart`).

### Schema Initialization Strategy

1. **Docker Container Automatic Initialization**:
   `docker-compose.yml` mounts `./infrastructure/postgres/init` into `/docker-entrypoint-initdb.d:ro`.
   When PostgreSQL starts with a fresh/empty volume, it automatically executes all `.sql` scripts in alphabetical order:
   - `01-init-schema.sql`: Creates all tables (`users`, `products`, `carts`, `cart_items`, `orders`, `order_items`, `payments`), unique constraints, foreign keys, performance indexes, and database-level DEFAULT constraints.

2. **Idempotency**:
   `01-init-schema.sql` (and `migrations/001_initial_schema.sql`) uses `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, and `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT`.
   It can safely be executed against an existing database without dropping data or throwing errors.

3. **Data Seeding**:
   - `DevAdminInitializer` seeds a development admin only when `DEV_ADMIN_ENABLED=true` and an explicit `DEV_ADMIN_PASSWORD` (12+ characters) is provided; it is disabled in the `prod` profile.
   - `DevProductInitializer` automatically loads the product catalog from `catalog.json` on application boot if products are missing.

4. **Hibernate JPA Alignment**:
   Entities specify explicit `columnDefinition` for default constraints, ensuring that even when JPA integration tests run against ephemeral or test databases with `ddl-auto=update`, the generated DDL preserves explicit database default values.
