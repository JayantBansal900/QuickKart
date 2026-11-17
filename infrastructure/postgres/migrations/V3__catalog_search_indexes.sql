-- 003: indexes for server-side catalog search, sorting and pagination.
--
-- Safe to run on a live database: CREATE INDEX CONCURRENTLY does not block reads/writes and
-- IF NOT EXISTS makes it re-runnable. (CONCURRENTLY cannot run inside a transaction block, so
-- execute this file with plain psql, not inside BEGIN/COMMIT.)
--
--   docker exec -i quickkart-postgres psql -U postgres -d quickkart < infrastructure/postgres/migrations/003_catalog_search_indexes.sql
--
-- Supports: ?sort=price-asc|price-desc and ?minPrice/?maxPrice range filters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_price ON products (price, id);
-- Supports: ?sort=rating-desc (NULL ratings sort last, matching the API).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_rating ON products (rating DESC NULLS LAST, id);
-- Supports: ?category=... which the API compares case-insensitively with UPPER(category).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category_upper ON products (UPPER(category));

-- Not added on purpose: free-text ?q= uses LIKE '%term%', which a B-tree index cannot serve.
-- At ~500 products a sequential scan is fast; at larger scale use pg_trgm (GIN) or full-text search.
