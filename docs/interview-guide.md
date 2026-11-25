# QuickKart — interview guide

How to explain this project in an interview. Every answer here matches the code; where something is *not* built, say so plainly. Interviewers respect honest scope much more than inflated claims.

---

## 1. The 60-second pitch

> "QuickKart is a full-stack e-commerce app I built with Spring Boot and React. The backend is split into an API gateway, a product service, an order service and a monolith for auth and admin, with PostgreSQL, Redis and Kafka, all running on Docker Compose.
>
> I focused on the problems real shops actually hit:
> - **No overselling:** checkout uses row locks.
> - **No duplicate orders:** checkout takes an idempotency key.
> - **No lost events:** order, payment and status events go through a transactional outbox to Kafka, and an idempotent consumer sends the emails.
> - **Payments that can fail:** online orders wait in `PENDING` until a (simulated) gateway confirms; failures can be retried and unpaid orders release their stock after 30 minutes.
> - **Account security:** sign-up and password reset use emailed one-time codes, and a password reset revokes every old JWT.
>
> Catalog search is server-side with a Redis cache. I load-tested it: about 914 requests per second with the cache warm versus 611 without on the 144-product catalog, and 867 versus 317 when it had 535 products: the cache matters more as the table grows. There are about 300 automated tests running in GitHub Actions.
>
> The payment gateway is simulated (test mode, no real provider), and it isn't deployed to the cloud."

## 2. Numbers to remember

| Fact | Value |
|---|---|
| Services | gateway :8080, monolith :8081, product :8082, order :8083, plus PostgreSQL, Redis, Kafka, nginx |
| Catalog | 144 products (18 per category) with photos, 8 categories |
| Tests | 99 monolith + 56 order + 49 product + 7 gateway + 91 frontend = **302**, plus an 87-check end-to-end script against the running stack |
| Search, cache hit | 914 req/s, p95 39 ms (144 products, 20 concurrent clients, local Docker) |
| Search, cache miss | 611 req/s, p95 57 ms (317 req/s with 535 products) |
| Cache TTL | 60 s |
| OTP | 6 digits, 5 min expiry, 5 attempts, HMAC-stored |
| JWT | 24 h, re-checked against the DB on every request |
| Kafka retry | 3 retries, 2 s apart, then dead-letter topic |

## 3. Draw this on the whiteboard

```
Browser → nginx (React) → API Gateway ─┬─> Product service ─> Redis cache
                                       ├─> Order service ──> outbox table ─> relay ─> Kafka
                                       └─> Monolith (auth/admin) <─ Kafka consumer → SMTP email
                         all services → one PostgreSQL (each owns its tables)
```

Walk one request end to end, for example "place an order", using the checkout flow in section 4.3.

---

## 4. Deep-dive questions

### 4.1 Architecture

**Q: Why microservices? Isn't this overkill for a small shop?**
Honestly, for this traffic a well-structured monolith would be fine. I split out the two parts with different needs:
- The **catalog** is read-heavy and cacheable, so it gets its own service and Redis.
- **Cart and checkout** are write-heavy and need strict locking.

Auth and admin stayed in the monolith because splitting them gave no benefit. The gateway gives the frontend one origin and one place for CORS and correlation IDs.

**Q: All services share one database. Isn't that an anti-pattern?**
It is a known compromise. Each service owns its tables and endpoints, but they share one PostgreSQL. I kept that while the boundaries settled, to avoid distributed transactions. The one cross-service write is checkout decrementing stock under a row lock. To fully separate the databases, I'd replace that write with a stock-reservation API, or with events plus compensation (a saga). The outbox is already in place to make those events reliable.

**Q: How does the gateway decide where to send a request?**
By path prefix, top to bottom:
- product paths → product service
- cart and order paths → order service
- everything else under `/api` → monolith

It also adds an `X-Correlation-ID` header so one request can be traced across all the logs, and it sets `X-Client-IP` for rate limiting.

### 4.2 Security

**Q: How does login work?**
1. Register: the account starts as `PENDING_VERIFICATION`, and a 6-digit code is emailed.
2. Verify the code: the account becomes `ACTIVE`.
3. Log in: the user gets a signed JWT (HMAC, 24 h).

Every service validates the JWT and also checks the database that the account still exists, is active and verified, and has the same role. So suspending a user takes effect immediately, not after the token expires.

**Q: JWTs are stateless. How do you log someone out everywhere after a password reset?**
I store `password_changed_at` on the user. Each request compares the token's issued-at time with it, and a token issued before the reset is rejected with `401`. This works in all three services without a Redis blacklist. Since I already look up the account on every request, it costs no extra query.

**Q: How do you store OTPs?**
Never in plain text. I store an HMAC-SHA256 of `purpose | email | nonce | otp` with a server secret.
- Because the purpose is part of the hash, a sign-up code can't be replayed as a password-reset code.
- Verification locks the row, so two concurrent requests can't both use the same code.
- Codes expire after 5 minutes and allow at most 5 attempts.

**Q: What is account enumeration and how did you prevent it?**
It means an attacker learning which emails are registered. I prevent it in three ways:
- **Same responses.** Forgot-password, resend and verify return the same message for known and unknown emails.
- **Same login timing.** Login runs a dummy BCrypt check for unknown emails, so it takes the same time.
- **Same reset timing.** The reset email is sent *after* the transaction commits, on a background thread, so the response time doesn't reveal whether an email went out.

**Q: Rate limiting?**
Redis counters (`INCR` + `EXPIRE` in a Lua script), keyed per action and email, plus a per-IP limit. For example: login 10 per 5 min, forgot-password 3 per 5 min, 60 requests per minute per IP. The client IP comes from the gateway's `X-Client-IP` header, which services trust only from internal addresses, so clients can't spoof it.

### 4.3 Checkout and concurrency

**Q: Two users buy the last item at the same time. What happens?**
Checkout runs in one transaction and locks each product row with `SELECT … FOR UPDATE` before checking stock. The second transaction waits for the first. When it continues, it sees stock 0 and fails with `409`. So the item can never be oversold.

**Q: Why pessimistic locks rather than optimistic versioning?**
For a hot item, optimistic locking means many transactions fail and retry. Row locks make them queue instead, and checkout transactions are short. I also lock the user row, which serializes one user's cart edits against their own checkout, even across the two services that touch the cart.

**Q: The user double-clicks "Place order", or the network times out and the browser retries.**
The frontend generates an idempotency key (UUID) once per checkout attempt.
- The server looks up `(user, key)`. If it exists, it returns the same order instead of creating a second one.
- If the same key arrives with *different* details, the server returns `409`.

**Q: The price changed while the user was on the checkout screen.**
The cart response includes a fingerprint: a hash of product IDs, quantities, prices and names. Checkout sends it back, and if the cart changed, the server refuses (`409`) and the UI asks the user to review again. Nobody pays a price they didn't see.

**Q: How do online payments work?**
The gateway is simulated, but the state machine is the real one. A UPI/card checkout reserves stock and creates the order in `PENDING` with a `PENDING` payment. `POST /orders/{id}/pay` plays the gateway callback:
- **Success:** payment `PAID`, order `PLACED`, a `PAYMENT_SUCCEEDED` event goes through the outbox (the confirmation email). A duplicate callback returns the same order, because the handler checks "already PAID" first, under the order's row lock.
- **Failure:** payment `FAILED`, the order stays payable, and the customer can retry from My Orders.
- **Never paid:** a scheduled job cancels the order after 30 minutes and puts the stock back. It locks the order row too, so if a payment arrives at the same moment, exactly one of them wins.
- **Cancelled after paying:** the payment becomes `REFUNDED`.

With a real provider (Razorpay/Stripe test mode) only the callback changes: verify the provider's signature, then run the same transitions.

**Q: Couldn't a user just call /pay with SUCCESS and get free goods?**
Yes, with the simulated gateway they could, which is why it's behind a flag that the `prod` profile forces off: production only accepts cash on delivery until a real provider's signed callback replaces it. A test runs the service with the flag off and checks that UPI is refused and not offered.

**Q: What about Redis locks for stock?**
I don't use them. The database row lock is the source of truth, so a separate Redis lock would only add a failure mode.

### 4.4 Kafka and the outbox

**Q: Why the transactional outbox? Why not just send to Kafka after saving the order?**
"Save, then send" has a gap. If the app crashes or Kafka is down right after the commit, the event is lost forever. Sending *before* the commit is worse: if the transaction then rolls back, you've announced an order that doesn't exist.

With the outbox:
1. I insert the event into an `outbox_events` table in the **same transaction** as the order. Both commit or neither does.
2. A scheduled relay reads unpublished rows every second, oldest first, and sends them to Kafka with `acks=all` and an idempotent producer.
3. The relay marks a row published only after Kafka confirms it.

**Q: What if Kafka is down for ten minutes?**
- **Orders:** checkout keeps working, because it only writes to PostgreSQL.
- **Relay:** the row stays pending, the relay records the attempt and the error, stops the batch to keep ordering, and retries on the next tick.
- **Monitoring:** the admin System page turns DOWN if any event has waited more than 2 minutes.
- **Recovery:** when Kafka returns, the backlog drains in order.

**Q: Kafka can deliver a message twice. How do you avoid sending two emails?**
Delivery is at least once, so the consumer is idempotent. Every event has an `eventId` (`ORDER_CREATED-<orderId>`). Before handling an event, the consumer checks a `processed_events` table; after handling it, the consumer inserts the ID there (primary key), and duplicates are skipped.

One honest edge case: if the process crashes after SMTP accepts the email but before the row is saved, that one email can be sent twice. SMTP can't take part in a database transaction, so exactly-once for an external side effect isn't really possible. You just make the window small.

**Q: What if one message keeps failing?**
The error handler retries 3 times, 2 seconds apart, then publishes the message to `quickkart.order-events.DLT` and moves on. One bad message can't block the partition. The dead-letter topic can be inspected and replayed.

**Q: Why key messages by order ID?**
Kafka keeps order within a partition, and the key decides the partition. So all events for one order are processed in order.

**Q: How did you test this?**
- **Integration test with an embedded Kafka broker:** a checkout produces exactly one outbox row, the relay delivers it to the topic, and a published row is never sent again.
- **Rollback test:** a checkout that rolls back leaves no outbox row.
- **Unit tests:** a Kafka outage keeps rows pending and preserves order, then recovers on the next run.
- **Consumer tests:** duplicate events are skipped, and a failing message ends up in the DLT.

### 4.5 Search and caching

**Q: How does search work?**
The product service builds a JPA `Specification` from the filters: text query, category, price range and sort. PostgreSQL does the filtering, sorting and paging, and the API returns one page plus the total count. Inputs are validated first (page size ≤ 48, query ≤ 100 characters, known sort names), so bad requests fail with `400` before reaching the database.

**Q: How does the cache stay correct?**
- **Expiry.** Entries expire after 60 s, which bounds how stale a page can get.
- **Eviction.** Admin writes evict the cache only after their transaction commits (`transactionAware`), so readers never cache data that was rolled back.
- **Checkout.** Checkout never trusts the cache; it reads live stock under a lock. The worst case is a listing that is up to a minute stale, never a wrong order.

**Q: What if Redis goes down?**
A `CacheErrorHandler` logs the error and the request goes straight to PostgreSQL. The site gets slower but keeps working. Also, cache deserialization only allows known DTO and JDK types, so a poisoned cache entry can't make Jackson instantiate an arbitrary class.

**Q: Measured impact?**
- 535 products: 867 vs 317 requests per second, p95 35.6 ms vs 94.3 ms (median of three runs).
- 144 products today: 914 vs 611 requests per second, p95 39 ms vs 57 ms (median of four runs).

The gap shrank because the uncached query got cheaper on a smaller table. That's the honest point: the cache's value grows with the catalog.

Same query, 20 concurrent clients, on my laptop's Docker. I'd call those comparison numbers, not production capacity.

### 4.6 Frontend

**Q: What's in the frontend?**
React 19, TypeScript, Vite and Tailwind 4, with light and dark themes using CSS variables. Notable details:
- **No theme flash:** a small script sets the theme before the first paint.
- **Shareable search:** the search state lives in the URL, so a link reproduces the results.
- **Fewer requests:** input is debounced, and an `AbortController` cancels outdated requests.
- **Timeouts:** every API call gives up after 15 s.
- **Admin routes** are separate and role-protected.

The frontend has 73 Vitest + Testing Library tests.

**Q: How is it served?**
In Docker, nginx serves the built files and proxies `/api` to the gateway. `index.html` is `no-cache` and the hashed asset files are cached for a year (`immutable`), so a deploy is picked up immediately but assets are only downloaded once.

### 4.7 Testing and CI

**Q: How do you test things that depend on PostgreSQL behaviour, like row locks?**
Most tests use H2 in PostgreSQL mode for speed. Locking and migration tests run against a real PostgreSQL in Testcontainers in CI, because H2 doesn't behave like PostgreSQL there.

**Q: What does CI run?**
- **Backend:** `mvn verify` for each of the four services, plus a check that no test-only libraries ended up in the runtime JAR.
- **PostgreSQL suite:** the Testcontainers tests.
- **Frontend:** typecheck, tests, build and `npm audit`.
- **Compose:** `docker compose config` validation.

All jobs pass on `main`.

---

### 4.8 Reviews, stock history, analytics, migrations

**Q: How do you stop fake reviews?**
Only a customer with a `DELIVERED` order containing the product can review it ("verified purchase"), and a unique key on `(product_id, user_id)` allows one review each; posting again edits it. Reviews show "Priya S.", never the email. The product's `rating` and `reviewCount` are a running average updated under the product's row lock in the same transaction, so two reviews at once can't lose an update.

**Q: How would you find out why stock is wrong?**
Every change writes a `stock_movements` row in the same transaction as the change: checkout (−n, "Order #41"), cancellation (+n), admin restock/correction, edits in the product form. The admin Inventory page shows the history per product, with who did it.

**Q: How is the analytics page computed?**
A few `GROUP BY` queries in PostgreSQL (revenue and orders per day, sign-ups per day, top products, revenue per category, status and payment mix), one round trip each, then missing days filled with zeros in Java so the chart has a point per day. "Revenue" means placed orders that weren't cancelled; unpaid online orders are left out.

**Q: How do schema changes reach the database?**
Flyway migrations in a one-shot `db-migrate` container that runs before the services (Compose `service_completed_successfully`). Existing databases were baselined at V5, so only new migrations run on them. In `prod`, Hibernate only validates the schema.

**Q: The JWT is in localStorage. Isn't that an XSS risk?**
Yes, that's the trade-off. The mitigation is a strict Content-Security-Policy from nginx: scripts only from our own origin and no inline scripts (I moved the theme pre-paint script into a file for this), so an injected `<script>` can't run. React also escapes output by default. The next step would be an httpOnly, SameSite cookie plus CSRF protection.

### 4.9 Coupons, returns, dispatch, wishlist

**Q: Where did these features come from?**
I studied what mature open-source stores offer (Saleor and Medusa for promotions, Solidus and Magento for returns, Saleor for fulfilment) and designed QuickKart's own versions. No code was copied; several of those projects have licences that wouldn't allow it anyway.

**Q: How do you stop two people from using the last use of a coupon?**
The checkout re-validates the coupon inside the same transaction as the order, after locking the coupon row (`SELECT … FOR UPDATE`), then increments `used_count`. The preview endpoint the checkout screen calls reserves nothing, so it can't be abused to block a code. Cancelling an order gives the use back. The coupon code is also part of the idempotency fingerprint, so a retry with a different coupon is rejected.

**Q: What happens when a return is approved?**
In one transaction: each item's stock goes back under its row lock (logged as `ORDER_RETURNED` in the stock history), the payment becomes `REFUNDED`, the order becomes `RETURNED`, and an `ORDER_STATUS_CHANGED` event goes through the outbox so the customer gets an email. Returns are allowed once per order, only within 7 days of `delivered_at`. Returned orders are excluded from revenue.

**Q: Why must dispatch include a tracking number?**
Because "shipped" without a tracking number is the most common support ticket in real stores. The API refuses `SHIPPED` without courier and tracking, stores both on the order, and the shipping email includes them.

## 5. Weaknesses — say these before they ask

| Weakness | What I'd do next |
|---|---|
| Payment gateway is simulated | Razorpay or Stripe in test mode: create the provider order, verify the webhook signature, then run the same `PENDING → PAID` transition. |
| Shared database | Separate databases per service, with stock reservation done through an API or a saga. |
| Not deployed | Docker images are ready. Next: ECS or a small VM, managed PostgreSQL/Redis, secrets in a secret manager. |
| `LIKE` search | PostgreSQL full-text search (`tsvector` + GIN index), or OpenSearch for a large catalog. |
| No metrics dashboard | Micrometer → Prometheus → Grafana, including outbox lag and consumer lag. |

## 6. Bugs I found and fixed (good "tell me about a bug" stories)

1. **Account enumeration.** Different error messages and timings revealed which emails were registered. Fixed with generic messages, a dummy BCrypt check, and sending the email after commit.
2. **Reset codes could verify sign-ups.** OTP hashes didn't include the purpose. Fixed by putting the purpose into the HMAC input.
3. **Old tokens survived a password reset.** Fixed with the `password_changed_at` vs JWT `iat` check in every service.
4. **Lost Kafka events.** Events used to be sent in an `AFTER_COMMIT` listener, so if Kafka was down at that moment, the event was gone. Replaced with the transactional outbox.
5. **Spoofable rate-limit IP.** Rate limiting could be keyed on an IP header the client controlled. Now the gateway sets `X-Client-IP` from the real peer address, and services trust it only from internal addresses.
6. **Stale frontend after a deploy.** nginx cached `index.html`. Fixed with `no-cache` for `index.html` and `immutable` for the hashed assets.
7. **Error messages leaking internals.** `500` responses included exception messages. They now return a generic message, and the details go to the log.
8. **Dead code left behind by the split.** After extracting the order and product services, the monolith still had its own cart, order and product controllers and services. The gateway never routed to them, but their tests kept passing, which hid the problem. I deleted them along with 79 tests that duplicated the order and product services' own tests, and fixed the end-to-end check that was still looking for the old log format.
9. **A catalog that looked fake.** Walking through the app as a customer showed products like "LG MX Master 3S" and a ₹999 Sony WH-1000XM5: the seed data had rotated brands across product names and ramped prices by row number. I rebuilt the catalog with matching brands and realistic prices, then cut it from 535 to a curated 144 (18 per category), each with a hand-checked photo, keeping SKUs and stock so carts and orders stayed valid. The live database was updated with SKU-keyed SQL instead of reseeding, and order history was unaffected because `order_items` stores its own product name. Trimming exposed another bug: the "product is in use" error told admins to mark it DISCONTINUED to hide it, but search never filtered that status. Search and category counts now exclude it, with a test. The walkthrough also showed product images not updating after a deploy, because nginx sent no cache header for them; they now use `no-cache` with ETag revalidation.
