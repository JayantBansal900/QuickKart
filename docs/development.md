# Development guide

## Prerequisites

Docker Desktop, JDK 17+ (CI uses Temurin 17), Maven 3.9+, Node 20+.

## 1. Configure `.env`

```bash
cp .env.example .env
```

The comments in `.env.example` explain each value. The important ones:

| Variable | Purpose |
|---|---|
| `POSTGRES_*`, `REDIS_PASSWORD` | database and cache credentials (any strong values locally) |
| `JWT_SECRET`, `OTP_HASH_SECRET` | long random secrets, e.g. `openssl rand -base64 48` |
| `SPRING_PROFILES_ACTIVE` | `dev` locally; `prod` enforces SMTP, `ddl-auto=validate` and no dev tools |
| `DEV_ADMIN_ENABLED`, `DEV_ADMIN_*` | create an admin account on start-up (dev only) |
| `DEV_PRODUCTS_ENABLED` | seed the 535-product catalog from `catalog.json` into an empty database |
| `MAIL_TRANSPORT` | `console` (codes appear in `docker logs quickkart-monolith`) or `smtp` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` | for Gmail: `smtp.gmail.com`, `587`, your address, and a 16-character **App Password** (Google Account → Security → 2-Step Verification → App passwords), not your normal password |

`.env` is git-ignored. Never commit it.

## 2. Build and start

The Dockerfiles copy already-built artifacts (the JARs and `frontend/dist`), so build them first:

```bash
for s in monolith product-service order-service api-gateway; do (cd backend/services/$s && mvn -q package -DskipTests); done
```

```bash
cd frontend && npm ci && npm run build && cd ..
```

```bash
docker compose up -d --build
```

```bash
docker compose ps
```

Startup order is enforced by health checks: PostgreSQL, Redis and Kafka start first, then the services, then the gateway, then the frontend.

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

Vite serves on :5173 and proxies `/api` and `/actuator` to the gateway on :8080, so the Docker backend must be running.

## 3. Database changes

A fresh database is created from `infrastructure/postgres/init/01-init-schema.sql`. Changes to an existing database go in numbered files under `infrastructure/postgres/migrations/` and are applied by hand, with a backup first:

```bash
docker exec quickkart-postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

```bash
docker exec -i quickkart-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < infrastructure/postgres/migrations/005_kafka_outbox_and_idempotency.sql
```

When you add a migration, update the init schema too. In `prod`, Hibernate only validates the schema (`ddl-auto=validate`).

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

The catalog lives in `backend/services/product-service/src/main/resources/catalog.json`: 535 products with real brands, matching product names and approximate Indian street prices. The seeder only inserts SKUs that are missing; it never overwrites existing rows. To push edited names, brands, prices or descriptions into an existing database (stock is left alone), run:

```bash
docker exec -i quickkart-postgres psql -U postgres -d quickkart -v ON_ERROR_STOP=1 < scripts/database/refresh-catalog-details.sql
```

Product artwork is generated from the product names, one SVG per SKU:

```bash
cd frontend && node scripts/generate-product-art.mjs && node scripts/validate-catalog.cjs
```

nginx serves these SVGs with `Cache-Control: no-cache`, so a regenerated picture shows up without a hard reload.

## 6. Cleaning up test data

`scripts/database/cleanup-test-data.sql` removes test accounts (addresses at `example.invalid`, `example.com`, `test.com`, `quickkart.test`, plus old benchmark users) together with their carts and orders, and any products outside the 535-item catalog. Admins and real-looking accounts are kept. By default it only reports what it would delete:

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
