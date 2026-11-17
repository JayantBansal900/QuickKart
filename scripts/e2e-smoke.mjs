// End-to-end smoke test of the RUNNING Docker stack (gateway :8080, nginx :3000, Postgres, Redis, Kafka).
// Creates two throwaway customers (e2e-*@example.invalid) and one COD order; restores the stock it uses.
// Requires .env with DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD and SPRING_PROFILES_ACTIVE=dev (OTP is read from logs).
// Usage (from project root):  node scripts/e2e-smoke.mjs .
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2];
const GW = "http://localhost:8080/api";
const WEB = "http://localhost:3000";
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

// This script reads OTP codes from the monolith log, which only works with console email delivery.
// With MAIL_TRANSPORT=smtp it would also try to email the fake @example.invalid test addresses.
if ((env.MAIL_TRANSPORT || "console") !== "console") {
  console.error("e2e-smoke needs MAIL_TRANSPORT=console (OTPs are read from the log). Set it in .env and recreate the backend container.");
  process.exit(2);
}

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}
async function call(method, path, { token, body, base = GW } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  return { status: res.status, json, text };
}
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const dockerLogs = (c, since = "10m") => { try { return execFileSync("docker", ["logs", "--since", since, c], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 }); } catch (e) { return (e.stdout || "") + (e.stderr || ""); } };
const redis = (...args) => docker("exec", "quickkart-redis", "redis-cli", ...args).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function otpFor(email) {
  const logs = dockerLogs("quickkart-monolith");
  const re = new RegExp(`To: ${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?Verification Code: (\\d{6})`, "g");
  let m, last = null; while ((m = re.exec(logs))) last = m[1];
  return last;
}
const stamp = Date.now();

// ---------- 1. Health & routing ----------
const gwHealth = await call("GET", "/actuator/health", { base: "http://localhost:8080" });
check("gateway /actuator/health UP", gwHealth.json?.status === "UP", `status=${gwHealth.status}`);
const bypass = await call("GET", "/order-service/actuator/health", { base: WEB });
check("nginx no longer proxies /order-service/ (gateway bypass removed)", !bypass.text.includes('"status"'), `got ${bypass.status}, ${bypass.text.slice(0, 40).replace(/\s+/g, " ")}`);
const spa = await call("GET", "/admin/login", { base: WEB });
check("nginx serves SPA for /admin/login", spa.status === 200 && spa.text.includes("<div id=\"root\">"), `status=${spa.status}`);

// ---------- 2. Catalog search ----------
const page0 = await call("GET", "/products");
check("GET /products is paged (size 24)", page0.status === 200 && page0.json?.content?.length <= 24 && page0.json.size === 24,
  `content=${page0.json?.content?.length}, total=${page0.json?.totalElements}, pages=${page0.json?.totalPages}`);
const cats = await call("GET", "/products/categories");
check("GET /products/categories", cats.status === 200 && Array.isArray(cats.json) && cats.json.length > 0, JSON.stringify(cats.json?.slice(0, 3)));
const firstCat = cats.json?.[0]?.category;
const byCat = await call("GET", `/products?category=${encodeURIComponent(firstCat)}&size=48`);
check("category filter returns only that category", byCat.json?.content?.every((p) => p.category.toUpperCase() === firstCat),
  `${firstCat}: ${byCat.json?.totalElements} items (categories endpoint says ${cats.json?.[0]?.count})`);
check("category count matches search total", byCat.json?.totalElements === cats.json?.[0]?.count);
const priced = await call("GET", "/products?minPrice=1000&maxPrice=5000&sort=price-asc&size=48");
const prices = (priced.json?.content ?? []).map((p) => Number(p.price));
check("price range + price-asc sort", prices.every((p, i) => p >= 1000 && p <= 5000 && (i === 0 || prices[i - 1] <= p)), `${priced.json?.totalElements} items`);
const rated = await call("GET", "/products?sort=rating-desc&size=48");
const ratings = (rated.json?.content ?? []).map((p) => p.rating ?? -1);
check("rating-desc sort on PostgreSQL (nulls last)", ratings.every((r, i) => i === 0 || ratings[i - 1] >= r), `top=${ratings.slice(0, 3)}`);
const p0 = await call("GET", "/products?sort=price-asc&size=10&page=0");
const p1 = await call("GET", "/products?sort=price-asc&size=10&page=1");
const overlap = p0.json.content.filter((a) => p1.json.content.some((b) => b.id === a.id));
check("pages do not overlap", overlap.length === 0 && p1.json.content.length > 0);
const q = await call("GET", "/products?q=" + encodeURIComponent(page0.json.content[0].name.split(" ")[0]));
check("text search finds a known product", q.json?.content?.some((p) => p.id === page0.json.content[0].id), `q results=${q.json?.totalElements}`);
const bad = await call("GET", "/products?sort=hack&size=999");
check("invalid search params → 400", bad.status === 400, `status=${bad.status}`);
const detail = await call("GET", `/products/${page0.json.content[0].id}`);
check("product detail", detail.status === 200 && detail.json?.id === page0.json.content[0].id);

// ---------- 3. Redis cache ----------
redis("--scan", "--pattern", "quickkart:productSearch*"); // warm-up connection
const key = "/products?q=cachecheck" + stamp;
await call("GET", key);
const cachedKeys = redis("--scan", "--pattern", `quickkart:productSearch*cachecheck${stamp}*`);
check("search result stored in Redis", cachedKeys.length > 0, cachedKeys.split("\n")[0]);
const ttl = cachedKeys ? Number(redis("TTL", cachedKeys.split("\n")[0])) : -2;
check("cached search TTL ≤ 60s", ttl > 0 && ttl <= 60, `ttl=${ttl}s`);
const tFirst = performance.now(); await call("GET", "/products?sort=name&page=3"); const missMs = performance.now() - tFirst;
const tSecond = performance.now(); await call("GET", "/products?sort=name&page=3"); const hitMs = performance.now() - tSecond;
results.push(`INFO  single-sample latency via gateway: miss ${missMs.toFixed(1)} ms, hit ${hitMs.toFixed(1)} ms (one sample each, not a benchmark)`);

// ---------- 4. Admin login & guard rails ----------
const adminLogin = await call("POST", "/auth/login", { body: { email: env.DEV_ADMIN_EMAIL, password: env.DEV_ADMIN_PASSWORD } });
check("dev admin login", adminLogin.status === 200 && adminLogin.json?.role === "ADMIN", `status=${adminLogin.status}`);
const A = adminLogin.json?.token;
const sys = await call("GET", "/admin/system/status", { token: A });
check("system status: all components UP", sys.json?.overall === "UP",
  (sys.json?.components ?? []).map((c) => `${c.name}=${c.status}(${c.latencyMs}ms)`).join(", "));
check("system status leaks no hosts/secrets", !/localhost|jdbc:|password|secret|:9092|:5432/i.test(sys.text));
const users = await call("GET", "/admin/users", { token: A });
check("admin users list has no password/otp fields", users.status === 200 && !/password|otp|hash/i.test(users.text), `${users.json?.length} users`);
const selfSuspend = await call("PATCH", `/admin/users/${adminLogin.json?.id}/status`, { token: A, body: { status: "SUSPENDED" } });
check("admin cannot suspend self → 409", selfSuspend.status === 409, `status=${selfSuspend.status}`);
const analyticsBefore = await call("GET", "/admin/analytics", { token: A });
check("analytics", analyticsBefore.status === 200 && "collectedRevenue" in (analyticsBefore.json ?? {}), JSON.stringify(analyticsBefore.json));

// Cache eviction on admin write: pick an in-stock product, +1 then -1
const target = (await call("GET", "/products?sort=featured&size=48")).json.content.find((p) => p.stockQuantity > 2);
await call("GET", "/products?sort=featured&size=48"); // ensure cached
const beforeKeys = redis("--scan", "--pattern", "quickkart:productSearch*").split("\n").filter(Boolean).length;
const plus = await call("PATCH", `/admin/products/${target.id}/stock`, { token: A, body: { adjustment: 1 } });
const afterKeys = redis("--scan", "--pattern", "quickkart:productSearch*").split("\n").filter(Boolean).length;
check("admin stock +1", plus.status === 200 && plus.json?.stockQuantity === target.stockQuantity + 1);
check("admin write evicts cached searches", beforeKeys > 0 && afterKeys === 0, `keys before=${beforeKeys} after=${afterKeys}`);
const fresh = (await call("GET", "/products?sort=featured&size=48")).json.content.find((p) => p.id === target.id);
check("listing shows new stock right after eviction", fresh?.stockQuantity === target.stockQuantity + 1);
const minus = await call("PATCH", `/admin/products/${target.id}/stock`, { token: A, body: { adjustment: -1 } });
check("admin stock -1 (restore)", minus.json?.stockQuantity === target.stockQuantity);
const neg = await call("PATCH", `/admin/products/${target.id}/stock`, { token: A, body: { adjustment: -(target.stockQuantity + 5) } });
check("stock cannot go negative → 400", neg.status === 400, `status=${neg.status}`);

// ---------- 5. Registration + OTP ----------
const email = `e2e-${stamp}@example.invalid`;
const password = "E2e-Passw0rd-" + stamp;
const reg = await call("POST", "/auth/register", { body: { name: "E2E Customer", email, password } });
check("register → 201 without token", reg.status === 201 && !reg.json?.token, `status=${reg.status}`);
check("register response has no OTP", !/\b\d{6}\b/.test(JSON.stringify({ ...reg.json, id: 0 })));
const early = await call("POST", "/auth/login", { body: { email, password } });
check("login before verification rejected", early.status >= 400 && !early.json?.token, `status=${early.status}`);
const dup = await call("POST", "/auth/register", { body: { name: "Dup", email, password } });
check("duplicate registration → 409, email not echoed", dup.status === 409 && !dup.text.includes(email), `status=${dup.status}`);
await sleep(500);
const otp = otpFor(email);
check("OTP delivered via dev console email", !!otp);
const wrong = await call("POST", "/auth/verify-otp", { body: { email, otp: otp === "000000" ? "111111" : "000000" } });
check("wrong OTP rejected", wrong.status === 400, `status=${wrong.status}`);
const ghost = await call("POST", "/auth/verify-otp", { body: { email: `ghost-${stamp}@example.invalid`, otp: "123456" } });
check("unknown email gives same error class as wrong OTP", ghost.status === wrong.status && ghost.json?.message === (await call("POST", "/auth/verify-otp", { body: { email: `ghost2-${stamp}@example.invalid`, otp: "123456" } })).json?.message);
const ver = await call("POST", "/auth/verify-otp", { body: { email, otp } });
check("correct OTP verifies and returns JWT", ver.status === 200 && !!ver.json?.token, `status=${ver.status}`);
const replay = await call("POST", "/auth/verify-otp", { body: { email, otp } });
check("OTP replay rejected", replay.status === 400, `status=${replay.status}`);
const login = await call("POST", "/auth/login", { body: { email, password } });
check("verified customer login", login.status === 200 && login.json?.role === "USER");
const C = login.json?.token;

// ---------- 6. Customer flow: cart → checkout → orders ----------
const forbidden = await call("GET", "/admin/analytics", { token: C });
check("customer → admin API forbidden", forbidden.status === 403, `status=${forbidden.status}`);
const forbidden2 = await call("PATCH", `/admin/products/${target.id}/stock`, { token: C, body: { adjustment: 100 } });
check("customer cannot change stock", forbidden2.status === 403, `status=${forbidden2.status}`);
const add = await call("POST", "/cart/items", { token: C, body: { productId: target.id, quantity: 1 } });
check("add to cart", add.status === 200, `status=${add.status} ${add.text.slice(0, 80)}`);
const cart = await call("GET", "/cart", { token: C });
const checkout = await call("POST", "/orders/checkout", {
  token: C,
  body: { paymentMethod: "COD", idempotencyKey: `e2e-${stamp}`, cartFingerprint: cart.json?.fingerprint,
    recipientName: "E2E Customer", deliveryAddress: "221B Test Street, Test City", deliveryPhone: "9876543210" },
});
check("COD checkout creates order", checkout.status === 201 && checkout.json?.paymentStatus === "COLLECTION_PENDING", `status=${checkout.status} ${checkout.text.slice(0, 100)}`);
const orderId = checkout.json?.id;
const retry = await call("POST", "/orders/checkout", {
  token: C, body: { paymentMethod: "COD", idempotencyKey: `e2e-${stamp}`, cartFingerprint: cart.json?.fingerprint,
    recipientName: "E2E Customer", deliveryAddress: "221B Test Street, Test City", deliveryPhone: "9876543210" },
});
check("checkout retry is idempotent (same order)", retry.json?.id === orderId);
const afterStock = (await call("GET", `/products/${target.id}`)).json?.stockQuantity;
check("stock decremented exactly once", afterStock === target.stockQuantity - 1, `${target.stockQuantity} → ${afterStock}`);
const mine = await call("GET", "/orders", { token: C });
check("customer sees own order", mine.json?.some((o) => o.id === orderId));

// IDOR: a second customer cannot read the first one's order
const email2 = `e2e2-${stamp}@example.invalid`;
await call("POST", "/auth/register", { body: { name: "E2E Other", email: email2, password } });
await sleep(500);
const v2 = await call("POST", "/auth/verify-otp", { body: { email: email2, otp: otpFor(email2) } });
const idor = await call("GET", `/orders/${orderId}`, { token: v2.json?.token });
check("other customer cannot read this order (IDOR)", idor.status === 404, `status=${idor.status}`);

// Kafka: order-service's outbox relay publishes ORDER_CREATED; the monolith consumer handles it once.
let kafkaSeen = false;
for (let i = 0; i < 30 && !kafkaSeen; i++) {
  await sleep(500);
  kafkaSeen = new RegExp(`Order event ORDER_CREATED-${orderId} processed`).test(dockerLogs("quickkart-monolith", "2m"));
}
check("Kafka ORDER_CREATED event consumed (outbox → Kafka → consumer)", kafkaSeen, `order #${orderId}`);

// Admin fulfils order → COD collected
for (const s of ["PROCESSING", "SHIPPED", "DELIVERED"]) await call("PATCH", `/admin/orders/${orderId}/status`, { token: A, body: { status: s } });
const delivered = (await call("GET", `/orders/${orderId}`, { token: C })).json;
check("delivered order → payment COLLECTED", delivered?.status === "DELIVERED" && delivered?.paymentStatus === "COLLECTED", `${delivered?.status}/${delivered?.paymentStatus}`);
const analyticsAfter = (await call("GET", "/admin/analytics", { token: A })).json;
check("collectedRevenue increased by order total",
  Math.abs(Number(analyticsAfter.collectedRevenue) - Number(analyticsBefore.json.collectedRevenue) - Number(checkout.json?.totalAmount)) < 0.01,
  `${analyticsBefore.json.collectedRevenue} → ${analyticsAfter.collectedRevenue}`);
const del = await call("DELETE", `/admin/products/${target.id}`, { token: A });
check("deleting an ordered product → 409", del.status === 409, `status=${del.status}`);

// Restore the stock consumed by the test order.
await call("PATCH", `/admin/products/${target.id}/stock`, { token: A, body: { adjustment: 1 } });

// ---------- 7. Suspension takes effect immediately ----------
const sus = await call("PATCH", `/admin/users/${v2.json?.id}/status`, { token: A, body: { status: "SUSPENDED" } });
const afterSus = await call("GET", "/orders", { token: v2.json?.token });
check("suspended user's existing JWT stops working", sus.status === 200 && afterSus.status === 401, `status=${afterSus.status}`);

console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${failures} failed`);
console.log(`Test data: users ${email}, ${email2} (suspended); order #${orderId}; product #${target.id} stock restored.`);
process.exit(failures ? 1 : 0);
