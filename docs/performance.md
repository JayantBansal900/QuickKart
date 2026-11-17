# Performance

## How it was measured

`node scripts/load-test.mjs --duration 15 --concurrency 20` (add `--json` for machine-readable output)

- **Setup:** the full Docker Compose stack on one Windows 11 laptop (Docker with 16 vCPU and 8 GB). The load generator ran on the same machine, so it competes with the services for CPU.
- **Load:** 20 concurrent clients, each sending its next request as soon as the last one finishes (closed loop). Each scenario runs for 15 s after 20 warm-up requests.
- **Path:** every request goes through the API gateway, exactly like the frontend's requests.
- **Cold-cache scenario:** each request uses a different `minPrice`, so every request is a Redis miss and runs the PostgreSQL query.

Measured 2026-11-17, median of three runs (run-to-run p95 varied by up to ~1.6× on this shared laptop):

| Scenario | Requests | req/s | p50 | p95 | p99 | Errors |
|---|---:|---:|---:|---:|---:|---:|
| Gateway health (baseline: gateway + one hop) | 26,143 | 1742 | 10.7 ms | 17.1 ms | 32.4 ms | 0 |
| Search `q=phone` (24 matches), sorted, 24 per page — cache hit | 13,014 | 867 | 21.9 ms | 35.6 ms | 45.6 ms | 0 |
| Same search, cache miss on every request | 4,779 | 317 | 58.6 ms | 94.3 ms | 196.1 ms | 0 |
| Category counts (cached) | 15,571 | 1037 | 18.1 ms | 29.8 ms | 43.7 ms | 0 |

## Reading the numbers

- **Redis cache:** about 2.7× more throughput (867 vs 317 req/s) and about 2.6× lower p95 (35.6 vs 94.3 ms) for the same search.
- **Uncached search:** stays around 100 ms at p95 under 20 concurrent users. It is a filtered `LIKE` search with sorting and a count over 535 rows, helped by the indexes from migration `003`.
- **Gateway overhead:** the health baseline puts the gateway hop at about 11 ms at p50, measured end-to-end on the same machine.

## Limits of this test

- It covers only public reads. Checkout is deliberately serialized per user and per product row (row locks), so its throughput depends on how many different products are being bought. A single-hot-product checkout test would mostly measure lock waiting.
- It was run on one laptop, not a production environment. Treat the numbers as a before/after comparison, not a capacity promise.
- The catalog is small (535 rows). With a much larger catalog, PostgreSQL full-text search (or a search engine) would replace `LIKE` matching.
