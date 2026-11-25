// End-to-end smoke test of the RUNNING Docker stack (gateway :8080, nginx :3000, Postgres, Redis, Kafka).
// Creates two throwaway customers (e2e-*@example.invalid) and one COD order; restores the stock it uses.
// Requires .env with DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD and SPRING_PROFILES_ACTIVE=dev (OTP is read from logs).
// Usage (from project root):  node scripts/e2e-smoke.mjs .
// Another stack (e.g. a second Compose project on other ports): set QK_GATEWAY, QK_WEB,
// QK_CONTAINER_PREFIX (default "quickkart") and QK_ENV_FILE.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2];
const GATEWAY = process.env.QK_GATEWAY || "http://localhost:8080";
const GW = `${GATEWAY}/api`;
const WEB = process.env.QK_WEB || "http://localhost:3000";
const PREFIX = process.env.QK_CONTAINER_PREFIX || "quickkart";
const env = Object.fromEntries(
  readFileSync(process.env.QK_ENV_FILE || join(ROOT, ".env"), "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
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
// REDISCLI_AUTH is passed through the environment, so the Redis password never appears in a command line.
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, REDISCLI_AUTH: env.REDIS_PASSWORD || "" },
});
const dockerLogs = (c, since = "10m") => { try { return execFileSync("docker", ["logs", "--since", since, c], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64e6 }); } catch (e) { return (e.stdout || "") + (e.stderr || ""); } };
const redis = (...args) => docker("exec", "-e", "REDISCLI_AUTH", `${PREFIX}-redis`, "redis-cli", ...args).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function otpFor(email) {
  const logs = dockerLogs(`${PREFIX}-monolith`);
  const re = new RegExp(`To: ${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?Verification Code: (\\d{6})`, "g");
  let m, last = null; while ((m = re.exec(logs))) last = m[1];
  return last;
}
const stamp = Date.now();

// ---------- 1. Health & routing ----------
const gwHealth = await call("GET", "/actuator/health", { base: GATEWAY });
check("gateway /actuator/health UP", gwHealth.json?.status === "UP", `status=${gwHealth.status}`);
const bypass = await call("GET", "/order-service/actuator/health", { base: WEB });
check("nginx no longer proxies /order-service/ (gateway bypass removed)", !bypass.text.includes('"status"'), `got ${bypass.status}, ${bypass.text.slice(0, 40).replace(/\s+/g, " ")}`);
const spa = await call("GET", "/admin/login", { base: WEB });
check("nginx serves SPA for /admin/login", spa.status === 200 && spa.text.includes("<div id=\"root\">"), `status=${spa.status}`);
// Every app route must load directly (refresh / shared link), even where a static folder has the same name.
const directLoads = [];
for (const route of ["/categories", "/info/about", "/products/1", "/account/orders", "/admin/analytics"]) {
  const r = await fetch(`${WEB}${route}`, { redirect: "manual" });
  directLoads.push(`${route}=${r.status}`);
}
check("app routes load directly (no redirect or 403)", directLoads.every((x) => x.endsWith("=200")), directLoads.join(" "));
const headers = (await fetch(`${WEB}/`)).headers;
check("nginx sends security headers (CSP, nosniff, frame deny)",
  /script-src 'self'/.test(headers.get("content-security-policy") ?? "") && headers.get("x-content-type-options") === "nosniff" && headers.get("x-frame-options") === "DENY");

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
check("admin users list is paged and has no password/otp fields", users.status === 200 && Array.isArray(users.json?.content) && !/password|otp|hash/i.test(users.text), `${users.json?.totalElements} users`);
const ordersPage = await call("GET", "/admin/orders?size=5", { token: A });
check("admin order list is paged", ordersPage.status === 200 && ordersPage.json?.size === 5 && Array.isArray(ordersPage.json?.content), `${ordersPage.json?.totalElements} orders`);
const lowStock = await call("GET", "/admin/products?stock=LOW&sort=stock", { token: A });
check("admin product list filters low stock", lowStock.status === 200 && (lowStock.json?.content ?? []).every((p) => p.stockQuantity < 5), `${lowStock.json?.totalElements} low`);
const categories = await call("GET", "/categories");
check("public category list (admin-managed)", categories.status === 200 && categories.json?.length >= 8 && categories.json.every((c) => c.key && c.name && c.active), categories.json?.map((c) => c.name).join(", "));
const insights = await call("GET", "/admin/analytics/insights?days=7", { token: A });
check("analytics insights: one point per day", insights.status === 200 && insights.json?.daily?.length === 7, `revenue=${insights.json?.revenue}`);
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
const moves = await call("GET", `/admin/products/${target.id}/stock-movements?size=2`, { token: A });
check("stock history records both adjustments", moves.json?.content?.[0]?.change === -1 && moves.json?.content?.[1]?.change === 1, JSON.stringify(moves.json?.content?.map((m) => m.reason)));

// ---------- 4b. Admin product with photo upload ----------
const created = await call("POST", "/admin/products", { token: A, body: { name: `E2E Photo Product ${stamp}`, description: "temporary", price: 499, stockQuantity: 3, category: "Accessories", sku: `E2E-PHOTO-${stamp}` } });
check("admin creates a product", created.status === 201, `status=${created.status}`);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
async function upload(bytes, name, type, token = A) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  const res = await fetch(`${GW}/admin/products/${created.json?.id}/image`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}
const up = await upload(PNG, "photo.png", "image/png");
check("admin uploads a product photo", up.status === 200 && /^\/api\/products\/images\/[0-9a-f-]{36}\.png$/.test(up.json?.imageUrl ?? ""), `status=${up.status} ${up.json?.imageUrl}`);
const img = await fetch(`${GATEWAY}${up.json?.imageUrl}`);
check("uploaded photo is served publicly as image/png", img.status === 200 && img.headers.get("content-type") === "image/png", `status=${img.status}`);
const fake = await upload(new TextEncoder().encode("<html>not an image</html>"), "evil.jpg", "image/jpeg");
check("a non-image renamed to .jpg is rejected", fake.status === 400, `status=${fake.status}`);
const del = await call("DELETE", `/admin/products/${created.json?.id}`, { token: A });
const gone = await fetch(`${GATEWAY}${up.json?.imageUrl}`);
check("deleting the product removes its photo", del.status === 204 && gone.status === 404, `delete=${del.status} image=${gone.status}`);

// ---------- 5. Registration + OTP ----------
const email = `e2e-${stamp}@example.invalid`;
const password = "E2e-Passw0rd-" + stamp;
const reg = await call("POST", "/auth/register", { body: { name: "E2E Customer", email, password } });
check("register → 201 without token", reg.status === 201 && !reg.json?.token, `status=${reg.status}`);
check("register response has no OTP", !/\b\d{6}\b/.test(JSON.stringify({ ...reg.json, id: 0 })));
const early = await call("POST", "/auth/login", { body: { email, password } });
check("login before verification rejected", early.status >= 400 && !early.json?.token, `status=${early.status}`);
const restart = await call("POST", "/auth/register", { body: { name: "E2E Customer", email, password } });
check("re-registering an unverified email restarts signup (fresh code)", restart.status === 201 && !restart.json?.token, `status=${restart.status}`);
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
const dup = await call("POST", "/auth/register", { body: { name: "Dup", email, password } });
check("registering a verified email → 409, email not echoed", dup.status === 409 && !dup.text.includes(email), `status=${dup.status}`);
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
// Coupons: an admin creates one, the customer previews it, and the order carries the discount.
const couponCode = `E2E${String(stamp).slice(-6)}`;
const newCoupon = await call("POST", "/admin/coupons", { token: A, body: { code: couponCode, description: "E2E test", discountType: "FLAT", discountValue: 10, oncePerCustomer: true } });
check("admin creates a coupon", newCoupon.status === 201, `status=${newCoupon.status}`);
const preview = await call("POST", "/cart/coupon", { token: C, body: { code: couponCode.toLowerCase() } });
check("customer previews the coupon on the cart", preview.status === 200 && Number(preview.json?.discount) === 10, JSON.stringify(preview.json));
const badCoupon = await call("POST", "/cart/coupon", { token: C, body: { code: "NO-SUCH-CODE" } });
check("unknown coupon → 400", badCoupon.status === 400, `status=${badCoupon.status}`);
const checkout = await call("POST", "/orders/checkout", {
  token: C,
  body: { paymentMethod: "COD", idempotencyKey: `e2e-${stamp}`, cartFingerprint: cart.json?.fingerprint,
    recipientName: "E2E Customer", deliveryAddress: "221B Test Street, Test City", deliveryPhone: "9876543210", couponCode },
});
check("COD checkout with a coupon creates a PLACED, discounted order", checkout.status === 201 && checkout.json?.status === "PLACED" && Number(checkout.json?.discountAmount) === 10 && checkout.json?.couponCode === couponCode,
  `status=${checkout.status} total=${checkout.json?.totalAmount} discount=${checkout.json?.discountAmount}`);
check("COD checkout creates a PLACED order", checkout.status === 201 && checkout.json?.status === "PLACED" && checkout.json?.paymentStatus === "COLLECTION_PENDING", `status=${checkout.status} ${checkout.text.slice(0, 100)}`);
const orderId = checkout.json?.id;
const retry = await call("POST", "/orders/checkout", {
  token: C, body: { paymentMethod: "COD", idempotencyKey: `e2e-${stamp}`, cartFingerprint: cart.json?.fingerprint,
    recipientName: "E2E Customer", deliveryAddress: "221B Test Street, Test City", deliveryPhone: "9876543210", couponCode },
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
  kafkaSeen = new RegExp(`Order event ORDER_CREATED-${orderId} processed`).test(dockerLogs(`${PREFIX}-monolith`, "2m"));
}
check("Kafka ORDER_CREATED event consumed (outbox → Kafka → consumer)", kafkaSeen, `order #${orderId}`);

// Admin fulfils order → COD collected
const skip = await call("PATCH", `/admin/orders/${orderId}/status`, { token: A, body: { status: "DELIVERED" } });
check("status cannot skip steps → 409", skip.status === 409, `status=${skip.status}`);
for (const s of ["CONFIRMED", "PROCESSING"]) await call("PATCH", `/admin/orders/${orderId}/status`, { token: A, body: { status: s } });
const shipNoTracking = await call("PATCH", `/admin/orders/${orderId}/status`, { token: A, body: { status: "SHIPPED" } });
check("dispatch without courier/tracking → 400", shipNoTracking.status === 400, `status=${shipNoTracking.status}`);
const shipped = await call("PATCH", `/admin/orders/${orderId}/status`, { token: A, body: { status: "SHIPPED", courier: "Delhivery", trackingNumber: "E2E-TRACK-1" } });
check("dispatch stores courier and tracking number", shipped.json?.courier === "Delhivery" && shipped.json?.trackingNumber === "E2E-TRACK-1", `${shipped.json?.courier} ${shipped.json?.trackingNumber}`);
for (const s of ["OUT_FOR_DELIVERY", "DELIVERED"]) await call("PATCH", `/admin/orders/${orderId}/status`, { token: A, body: { status: s } });
const delivered = (await call("GET", `/orders/${orderId}`, { token: C })).json;
check("delivered order → payment COLLECTED", delivered?.status === "DELIVERED" && delivered?.paymentStatus === "COLLECTED", `${delivered?.status}/${delivered?.paymentStatus}`);
const analyticsAfter = (await call("GET", "/admin/analytics", { token: A })).json;
check("collectedRevenue increased by order total",
  Math.abs(Number(analyticsAfter.collectedRevenue) - Number(analyticsBefore.json.collectedRevenue) - Number(checkout.json?.totalAmount)) < 0.01,
  `${analyticsBefore.json.collectedRevenue} → ${analyticsAfter.collectedRevenue}`);
let deliveredEvent = false;
for (let i = 0; i < 30 && !deliveredEvent; i++) {
  await sleep(500);
  deliveredEvent = new RegExp(`Order event ORDER_STATUS-${orderId}-DELIVERED processed`).test(dockerLogs(`${PREFIX}-monolith`, "2m"));
}
check("status-change event consumed (delivered email)", deliveredEvent);

// Reviews: only after delivery; posting updates the product rating; the test review is removed again.
const otherProduct = page0.json.content.find((p) => p.id !== target.id);
const notBought = await call("POST", `/products/${otherProduct.id}/reviews`, { token: C, body: { rating: 5 } });
check("cannot review a product you did not receive → 403", notBought.status === 403, `status=${notBought.status}`);
const review = await call("POST", `/products/${target.id}/reviews`, { token: C, body: { rating: 5, comment: "E2E review" } });
check("customer reviews a delivered product", review.status === 200 && review.json?.verifiedPurchase === true, `status=${review.status}`);
const reviews = await call("GET", `/products/${target.id}/reviews`);
check("review is public without the author's email", reviews.json?.content?.some((r) => r.id === review.json?.id) && !reviews.text.includes(email));
const unreview = await call("DELETE", `/products/${target.id}/reviews/${review.json?.id}`, { token: C });
check("customer deletes own review", unreview.status === 204, `status=${unreview.status}`);

// Wishlist
const wishAdd = await call("PUT", `/wishlist/${otherProduct.id}`, { token: C });
const wishIds = await call("GET", "/wishlist/ids", { token: C });
check("wishlist saves a product", wishAdd.status === 204 && wishIds.json?.includes(otherProduct.id), JSON.stringify(wishIds.json));
const wishDel = await call("DELETE", `/wishlist/${otherProduct.id}`, { token: C });
check("wishlist removes it again", wishDel.status === 204 && !(await call("GET", "/wishlist/ids", { token: C })).json?.includes(otherProduct.id));

// Saved delivery address on the profile.
const prof = await call("PUT", "/user/profile", { token: C, body: { name: "E2E Customer", savedAddress: "221B Test Street, Test City" } });
check("profile saves a default delivery address", prof.status === 200 && prof.json?.savedAddress === "221B Test Street, Test City", `status=${prof.status}`);

// ---------- Simulated online payment ----------
await call("POST", "/cart/items", { token: C, body: { productId: target.id, quantity: 1 } });
const cart2 = await call("GET", "/cart", { token: C });
const methods = await call("GET", "/orders/payment-methods", { token: C });
check("dev profile offers COD, UPI and card", JSON.stringify(methods.json?.methods) === JSON.stringify(["COD", "UPI", "CARD"]), JSON.stringify(methods.json));
const online = await call("POST", "/orders/checkout", {
  token: C,
  body: { paymentMethod: "UPI", idempotencyKey: `e2e-upi-${stamp}`, cartFingerprint: cart2.json?.fingerprint,
    recipientName: "E2E Customer", deliveryAddress: "221B Test Street, Test City", deliveryPhone: "9876543210" },
});
check("UPI checkout waits for payment", online.status === 201 && online.json?.status === "PENDING" && online.json?.payable === true, `${online.json?.status}/${online.json?.paymentStatus}`);
const failedPay = await call("POST", `/orders/${online.json?.id}/pay`, { token: C, body: { outcome: "FAILURE" } });
check("failed payment keeps the order payable", failedPay.json?.paymentStatus === "FAILED" && failedPay.json?.payable === true, failedPay.json?.paymentStatus);
const paid = await call("POST", `/orders/${online.json?.id}/pay`, { token: C, body: { outcome: "SUCCESS" } });
check("successful payment places the order", paid.json?.status === "PLACED" && paid.json?.paymentStatus === "PAID", `${paid.json?.status}/${paid.json?.paymentStatus}`);
let paymentEvent = false;
for (let i = 0; i < 30 && !paymentEvent; i++) {
  await sleep(500);
  paymentEvent = new RegExp(`Order event PAYMENT_SUCCEEDED-${online.json?.id} processed`).test(dockerLogs(`${PREFIX}-monolith`, "2m"));
}
check("PAYMENT_SUCCEEDED event consumed", paymentEvent);
const refunded = await call("POST", `/orders/${online.json?.id}/cancel`, { token: C });
check("cancelling a paid order refunds it", refunded.json?.status === "CANCELLED" && refunded.json?.paymentStatus === "REFUNDED", `${refunded.json?.status}/${refunded.json?.paymentStatus}`);

// Returns: the delivered COD order is returned; approving restocks it and refunds the customer.
const stockBeforeReturn = (await call("GET", `/products/${target.id}`)).json?.stockQuantity;
const ret = await call("POST", `/orders/${orderId}/return`, { token: C, body: { reason: "DAMAGED", comment: "E2E return" } });
check("customer requests a return of a delivered order", ret.status === 200 && ret.json?.returnStatus === "REQUESTED", `status=${ret.status}`);
const pending = await call("GET", "/admin/returns?status=REQUESTED", { token: A });
const myReturn = pending.json?.content?.find((r) => r.orderId === orderId);
const approved = await call("PATCH", `/admin/returns/${myReturn?.id}`, { token: A, body: { decision: "APPROVE", note: "E2E" } });
check("admin approves the return: order RETURNED, payment REFUNDED", approved.json?.order?.status === "RETURNED" && approved.json?.order?.paymentStatus === "REFUNDED", `${approved.json?.order?.status}/${approved.json?.order?.paymentStatus}`);
const stockAfterReturn = (await call("GET", `/products/${target.id}`)).json?.stockQuantity;
check("returned items go back into stock", stockAfterReturn === stockBeforeReturn + 1, `${stockBeforeReturn} → ${stockAfterReturn}`);
await call("PATCH", `/admin/products/${target.id}/stock`, { token: A, body: { adjustment: -1 } }); // the restore below adds it back again

// Admin view of open carts
await call("POST", "/cart/items", { token: C, body: { productId: otherProduct.id, quantity: 1 } });
const openCarts = await call("GET", "/admin/carts", { token: A });
check("admin sees the customer's open cart", openCarts.json?.some((c) => c.customerEmail === email && c.itemCount >= 1), `${openCarts.json?.length} open carts`);
await call("DELETE", "/cart", { token: C });

const delOrdered = await call("DELETE", `/admin/products/${target.id}`, { token: A });
check("deleting an ordered product → 409", delOrdered.status === 409, `status=${delOrdered.status}`);

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
