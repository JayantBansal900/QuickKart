# Development guide

## Prerequisites

Docker Desktop, JDK 17+ (CI uses Temurin 17), Maven 3.9+. Node 22+ for frontend development (the Docker image builds the frontend itself).

## 1. Configure `.env`

```bash
cp .env.example .env
```

The comments in `.env.example` explain each value. The important ones:

| Variable | Purpose |
|---|---|
| `POSTGRES_*` | database credentials (any strong values locally) |
| `REDIS_PASSWORD` | required: Redis runs with `requirepass` (e.g. `openssl rand -hex 24`) |
| `JWT_SECRET`, `OTP_HASH_SECRET` | long random secrets, e.g. `openssl rand -base64 48` |
| `SPRING_PROFILES_ACTIVE` | `dev` locally; `prod` enforces SMTP, `ddl-auto=validate` and no dev tools |
| `DEV_ADMIN_ENABLED`, `DEV_ADMIN_*` | create an admin account on start-up (dev only) |
| `DEV_PRODUCTS_ENABLED` | `true` by default: seed the 144-product catalog into an empty database (missing SKUs only; never in `prod`) |
| `MAIL_TRANSPORT` | `console` (codes appear in `docker logs quickkart-monolith`) or `smtp` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | for Gmail: `smtp.gmail.com`, `587`, your address, and a 16-character **App Password** (Google Account → Security → 2-Step Verification → App passwords), not your normal password |

`.env` is git-ignored. Never commit it.

## 2. Build and start

The Java Dockerfiles copy the already-built JARs, so build them first (the frontend image builds the React app itself):

```bash
for s in monolith product-service order-service api-gateway; do (cd backend/services/$s && mvn -q package -DskipTests); done
```

```bash
docker compose up -d --build --wait
```

```bash
docker compose ps
```

Startup order is enforced by health checks: PostgreSQL, Redis and Kafka start first, then the one-shot `db-migrate` container applies the Flyway migrations, then the services, then the gateway, then the frontend. Only the storefront (:3000) and the gateway (:8080) are meant to be used from the host; PostgreSQL, Redis, Kafka and the services are published on `127.0.0.1` only, for debugging.

| URL | What |
|---|---|
| http://localhost:3000 | storefront |
| http://localhost:3000/admin/login | admin panel |
| http://localhost:8080/actuator/health | gateway health |

After changing one service, rebuild just that one:

```bash
(cd backend/services/order-service && mvn -q package -DskipTests) && docker compose build order-service && docker compose up -d --no-deps --force-recreate order-service
```

### Frontend with hot reload

```bash
cd frontend && npm ci && npx vite
```

Vite serves on :5173 and proxies `/api` and `/actuator` to the gateway on :8080, so the backend must be running (in Docker or as below). `npm run dev` does the same as `npx vite`.

### Each service in its own terminal (VS Code, Windows PowerShell)

Useful when you are changing Java code and want to restart one service quickly. PostgreSQL, Redis and Kafka stay in Docker; the app services run on your machine. Stop the app containers first so the ports are free:

```bash
docker compose stop frontend api-gateway order-service product-service backend
```

```bash
docker compose up -d --wait postgres redis kafka
```

```bash
docker compose run --rm db-migrate
```

Spring Boot does not read `.env`, so each Java terminal loads it first with `scripts/load-env.ps1`. Start them in this order and wait for `Started …Application` in each:

| Terminal | Commands | Port |
|---|---|---|
| 1. monolith | `cd backend\services\monolith`<br>`. ..\..\..\scripts\load-env.ps1`<br>`mvn spring-boot:run` | 8081 |
| 2. product-service | `cd backend\services\product-service`<br>`. ..\..\..\scripts\load-env.ps1`<br>`mvn spring-boot:run` | 8082 |
| 3. order-service | `cd backend\services\order-service`<br>`. ..\..\..\scripts\load-env.ps1`<br>`mvn spring-boot:run` | 8083 |
| 4. api-gateway | `cd backend\services\api-gateway`<br>`. ..\..\..\scripts\load-env.ps1`<br>`mvn spring-boot:run` | 8080 |
| 5. frontend | `cd frontend`<br>`npx vite` | 5173 |

Open http://localhost:5173. `Ctrl+C` stops a service; run `mvn spring-boot:run` again in that terminal to restart it with your changes. To go back to the all-Docker setup, stop the five terminals and run `docker compose up -d --wait`.

## 3. Database changes (Flyway)

A fresh database is created from `infrastructure/postgres/init/01-init-schema.sql` (the schema as of V5). After that, every change is a numbered Flyway migration in `infrastructure/postgres/migrations/` (`V6__categories_reviews_stock_history_addresses.sql`, ...). The `db-migrate` container runs Flyway on every `docker compose up`, before the services start; it applies only migrations that are not yet in `flyway_schema_history`. Databases created before Flyway was added are baselined at V5 automatically, so only V6+ runs on them.

To add a change: create the next `V<n>__description.sql` (additive and safe to re-run where possible), then `docker compose run --rm db-migrate`. Take a backup first on a database you care about:

```bash
docker exec quickkart-postgres pg_dump -U postgres quickkart > backup.sql
```

In `prod`, Hibernate only validates the schema (`ddl-auto=validate`), so a missing migration fails at startup instead of silently changing tables.

## 4. Tests

```bash
cd backend/services/monolith && mvn verify
```

Run the same in `product-service`, `order-service` and `api-gateway`. The tests use H2 (PostgreSQL mode) and an embedded Kafka broker, so no Docker is needed.

PostgreSQL-specific tests (row locking, migrations) run against a throwaway Testcontainers database:

```bash
cd backend/services/order-service && mvn -Dquickkart.test.postgres=true -Dtest=CommerceReliabilityIntegrationTest,CommerceMigrationIntegrationTest verify
```

Frontend:

```bash
cd frontend && npm run typecheck && npm test && npm run build
```

Against the running stack (needs `MAIL_TRANSPORT=console`, because it reads codes from the log; it creates `@example.invalid` users and one order):

```bash
node scripts/e2e-smoke.mjs .
```

```bash
node scripts/load-test.mjs --duration 15 --concurrency 20
```

## 5. Catalog data

Categories are managed in the admin panel (Admin → Categories); the eight defaults are created by migration V6 (and by product-service on an empty table). The catalog lives in `backend/services/product-service/src/main/resources/catalog.json`: 144 products (18 per category) with real brands, matching names, approximate Indian street prices and a product photo each. The seeder only inserts SKUs that are missing; it never overwrites existing rows. To push edited names, brands, prices or descriptions into an existing database (stock is left alone), run:

```bash
docker exec -i quickkart-postgres psql -U postgres -d quickkart -v ON_ERROR_STOP=1 < scripts/database/refresh-catalog-details.sql
```

Product photos live in `frontend/public/products/photos/` (Pixabay, free licence; see [photo-credits.md](photo-credits.md)). How they were chosen and how to re-download them is in [scripts/catalog/README.md](../scripts/catalog/README.md). Category tiles use `frontend/public/categories/`. Admins can replace any product photo from the admin panel. Check that every product has a valid image with:

```bash
cd frontend && node scripts/validate-catalog.cjs
```

The first seed gave 20 catalog products 0 stock. catalog.json is fixed; for an existing database run `scripts/database/fix-seed-stock.sql` (it only changes those products while they are still at 0, and records each change in the stock history).

To shrink an older database (which had 535 seed products) to the current catalog, run `scripts/database/trim-to-catalog.sql` after a backup. Products that appear in past orders are kept but marked `DISCONTINUED`, which hides them from search and category counts.

## 6. Cleaning up test data

`scripts/database/cleanup-test-data.sql` removes test accounts (addresses at `example.invalid`, `example.com`, `test.com`, `quickkart.test`, plus old benchmark users) together with their carts and orders, and any product whose SKU is not a catalog SKU (`SKU-<CATEGORY>-NNN`). Check the report first: a product you created in the admin panel with a different SKU would be removed too. Admins and real-looking accounts are kept. By default it only reports what it would delete:

```bash
docker exec -i quickkart-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < scripts/database/cleanup-test-data.sql
```

To actually delete, run it with `-v apply=1`, after taking a backup.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push and pull request:

1. `mvn verify` for each of the four services, plus a check that no test dependencies leak into the runtime JAR.
2. The PostgreSQL Testcontainers suite for the monolith and the order service.
3. Frontend: typecheck, lint, tests, build, catalog validation and `npm audit`.
4. `docker compose config` validation.

`deploy-aws.yml` is a placeholder; there is no configured deployment target.
