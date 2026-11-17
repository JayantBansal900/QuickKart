// Load test for the RUNNING Docker stack, through the API gateway (no external tools needed).
// Measures latency percentiles and throughput for the public catalog endpoints, with the Redis
// cache warm (same query repeated) and cold (every request uses a different filter, so it misses).
//
// Usage (from project root):  node scripts/load-test.mjs [--duration 15] [--concurrency 20]
// Results depend on the machine; record the hardware next to any numbers you quote.

const GW = process.env.GATEWAY_URL || "http://localhost:8080";
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const DURATION_S = arg("duration", 15);
const CONCURRENCY = arg("concurrency", 20);

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function scenario(name, nextUrl) {
  // Warm-up so JIT/connection pools don't skew the first numbers.
  for (let i = 0; i < 20; i++) await fetch(nextUrl(i)).then((r) => r.arrayBuffer());

  const latencies = [];
  const statuses = new Map();
  let seq = 0;
  const end = performance.now() + DURATION_S * 1000;
  const worker = async () => {
    while (performance.now() < end) {
      const url = nextUrl(seq++);
      const t0 = performance.now();
      let status;
      try {
        const res = await fetch(url);
        await res.arrayBuffer();
        status = res.status;
      } catch {
        status = "ERR";
      }
      latencies.push(performance.now() - t0);
      statuses.set(status, (statuses.get(status) || 0) + 1);
    }
  };
  const started = performance.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const elapsed = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const ok = statuses.get(200) || 0;
  return {
    scenario: name,
    requests: latencies.length,
    "ok %": ((ok / latencies.length) * 100).toFixed(1),
    "req/s": (latencies.length / elapsed).toFixed(0),
    "p50 ms": percentile(latencies, 50).toFixed(1),
    "p95 ms": percentile(latencies, 95).toFixed(1),
    "p99 ms": percentile(latencies, 99).toFixed(1),
    "non-200": [...statuses].filter(([s]) => s !== 200).map(([s, n]) => `${s}×${n}`).join(" ") || "-",
  };
}

const health = await fetch(`${GW}/actuator/health`).then((r) => r.json()).catch(() => null);
if (health?.status !== "UP") {
  console.error(`Gateway at ${GW} is not UP. Start the stack with docker compose up -d first.`);
  process.exit(2);
}

console.log(`QuickKart load test — ${CONCURRENCY} concurrent clients, ${DURATION_S}s per scenario, via ${GW}\n`);
const rows = [];
rows.push(await scenario("gateway health", () => `${GW}/actuator/health`));
rows.push(await scenario("search (cache warm)", () => `${GW}/api/products?q=phone&sort=price-asc&page=0&size=24`));
// A different minPrice per request gives a distinct cache key every time, so each hits PostgreSQL.
rows.push(await scenario("search (cache miss)", (i) => `${GW}/api/products?q=phone&minPrice=${(i % 100000) / 100}&sort=price-asc&page=0&size=24`));
rows.push(await scenario("category counts", () => `${GW}/api/products/categories`));
console.table(rows);
