# Performance

## How it was measured

`node scripts/load-test.mjs --duration 15 --concurrency 20` (add `--json` for machine-readable output)

- **Setup:** the full Docker Compose stack on one Windows 11 laptop (Docker with 16 vCPU and 8 GB). The load generator ran on the same machine, so it competes with the services for CPU.
- **Load:** 20 concurrent clients, each sending its next request as soon as the last one finishes (closed loop). Each scenario runs for 15 s after 20 warm-up requests.
- **Path:** every request goes through the API gateway, exactly like the frontend's requests.
- **Cold-cache scenario:** each request uses a different `minPrice`, so every request is a Redis miss and runs the PostgreSQL query.

### Current catalog (144 products)

Measured 2026-11-17 on a fresh stack seeded with the current 144-product catalog. Five runs were made; the first is left out as JVM warm-up (it was 30–45 % slower everywhere), and the table shows the median of runs 2–5. The laptop was also running a second copy of the services at the time, so treat the spread as noise: cache-hit search ranged 810–1035 req/s across those runs.

| Scenario | req/s | p50 | p95 | p99 | Errors |
|---|---:|---:|---:|---:|---:|
| Gateway health (baseline: gateway + one hop) | 1399 | 12.9 ms | 24.4 ms | 39.8 ms | 0 |
| Search, sorted, 24 per page — cache hit | 914 | 20.0 ms | 39.0 ms | 57.0 ms | 0 |
| Same search, cache miss on every request | 611 | 30.3 ms | 57.2 ms | 77.1 ms | 0 |
| Category counts (cached) | 1112 | 16.1 ms | 29.7 ms | 52.5 ms | 0 |

### Earlier catalog (535 products), for comparison

Median of three runs, same machine and settings:

| Scenario | req/s | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Gateway health | 1742 | 10.7 ms | 17.1 ms | 32.4 ms |
| Search — cache hit | 867 | 21.9 ms | 35.6 ms | 45.6 ms |
| Search — cache miss | 317 | 58.6 ms | 94.3 ms | 196.1 ms |
| Category counts (cached) | 1037 | 18.1 ms | 29.8 ms | 43.7 ms |

## Reading the numbers

- **Redis cache:** with 144 products the cache gives about 1.5× the throughput (914 vs 611 req/s) and a lower p95 (39 vs 57 ms). With 535 products the gap was 2.7×. The uncached query got about twice as fast on the smaller table, so the cache matters less today and more as the catalog grows: its cost stays flat while the database query's cost grows with the number of rows.
- **Uncached search:** stays under 60 ms at p95 under 20 concurrent users: a filtered `LIKE` search with sorting and a count, helped by the indexes from migration V3.
- **Gateway overhead:** the health baseline puts the gateway hop at about 13 ms at p50, measured end-to-end on the same machine.

## Limits of this test

- It covers only public reads. Checkout is deliberately serialized per user and per product row (row locks), so its throughput depends on how many different products are being bought. A single-hot-product checkout test would mostly measure lock waiting.
- It was run on one laptop, not a production environment. Treat the numbers as a before/after comparison, not a capacity promise.
- The catalog is small (144 products). With a much larger catalog, PostgreSQL full-text search (or a search engine) would replace `LIKE` matching.
