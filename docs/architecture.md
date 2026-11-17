# Architecture and design decisions

## Components

| Component | Port | Owns |
|---|---|---|
| nginx + React SPA | 3000 | Serves the built frontend. Proxies `/api` to the gateway. `index.html` is `no-cache` and hashed `/assets/*` are `immutable`. |
| API gateway (Spring Cloud Gateway) | 8080 | The single entry point: path routing, CORS, `X-Correlation-ID`, and `X-Client-IP` for rate limiting. |
| Monolith | 8081 | Registration, OTP, login, password reset, profiles, admin users/analytics/system status, email, and the Kafka consumer. |
| Product service | 8082 | Catalog read/search, category counts, admin product CRUD and stock adjustment, and the Redis cache. |
| Order service | 8083 | Cart, COD checkout, order lifecycle (customer cancel, admin transitions), and the transactional outbox and relay. |
| PostgreSQL 15 | 5432 | One shared database. Schema in `infrastructure/postgres/init` plus numbered migrations. |
| Redis 7 | 6379 | Catalog cache and auth rate-limit counters. |
| Kafka 3.7 (KRaft) | 9092 | Topic `quickkart.order-events` and its dead-letter topic `quickkart.order-events.DLT`. |

### Gateway routing

Routes are matched top to bottom ([application.yml](../backend/services/api-gateway/src/main/resources/application.yml)):

| Path | Service |
|---|---|
| `/api/products/**`, `/api/admin/products/**`, `/api/categories/**`, `/api/admin/categories/**` | product service (catalog, categories, reviews, stock history) |
| `/api/cart/**`, `/api/orders/**`, `/api/admin/orders/**` | order service (cart, checkout, payments) |
| `/api/auth/**`, `/api/admin/**`, any other `/api/**` | monolith (auth, profile, users, analytics, system) |

Cart, order and catalog code used to live in the monolith too. After the split, those copies were deleted, so each endpoint has exactly one implementation.

### Why a shared database?

The services were split out of a monolith step by step. Keeping one database avoided distributed transactions while the boundaries settled: each service owns its tables and endpoints, and the only cross-service writes are explicit (for example, checkout decrements `products.stock_quantity` under a row lock). The next step towards fully separate databases would be to replace that shared stock write with a reservation API or event. The outbox is already in place to make that safe.

---

## Authentication and account security

```mermaid
sequenceDiagram
    participant U as User
    participant M as Monolith
    participant DB as PostgreSQL
    participant S as SMTP
    U->>M: POST /auth/register
    M->>DB: user (PENDING_VERIFICATION) + HMAC(purpose|email|nonce|otp)
    M->>S: 6-digit code (rolls back the signup if sending fails → 503)
    U->>M: POST /auth/verify-otp
    M->>DB: lock challenge, check expiry (5 min) and attempts (max 5), mark used
    U->>M: POST /auth/login
    M-->>U: JWT (24 h)
    U->>M: any request + Bearer JWT
    M->>DB: account still ACTIVE + verified? token issued after password_changed_at?
```

- **Passwords** are hashed with BCrypt. Unknown emails still run a dummy BCrypt check, so login timing does not reveal which emails exist.
- **OTP codes** are never stored in plain text. They are stored as HMAC-SHA256 over `purpose | email | nonce | otp`. Because the purpose is part of the hash, a sign-up code can't be used as a password-reset code. Verification uses a row lock, so a code can be consumed once even under concurrent requests.
- **Account enumeration.** Register, resend, forgot-password and verify give generic answers. The forgot-password email is sent after the transaction commits, on a background executor, so response time is the same whether the account exists or not.
- **Rate limits** (Redis counters with an in-memory fallback), per email and per IP:
  - login, verify and reset: 10 per 5 min
  - resend and forgot: 3 per 5 min
  - register: 5 per hour
  - IP-wide: 60 per minute
- **Client IP.** The gateway sets `X-Client-IP` from the real peer address. Services trust that header only when the request comes from a private or loopback address, so a client can't spoof its IP.
- **JWT revocation without a blacklist.** Each service's JWT filter checks the account in the database on every request: it must exist, be `ACTIVE` and verified, and keep the same role. A password reset sets `users.password_changed_at`, and any token whose `iat` is earlier is rejected (`401`) by the monolith *and* the order and product services.
- **Abandoned signups.** If someone registers but never verifies, registering again with the same email reuses that account, saves the new details and emails a fresh code (all older codes are voided). Verified accounts and admin accounts are never touched this way.
- **Roles.** `USER` and `ADMIN`. `/api/admin/**` requires `ADMIN` in every service. An admin can't suspend themselves or another admin (`409`).
- **Email.** `MAIL_TRANSPORT=console` logs emails in dev; `smtp` sends multipart HTML and text emails. The `prod` profile forces SMTP. Reserved test domains (`.invalid`, `.test`, `example.com`, …) are never emailed.

---

## Catalog search and caching

`GET /api/products` builds a JPA `Specification` from `q` (name, brand, description, category), `category`, `minPrice`, `maxPrice`, `sort` and paging, and returns a `PageResponse`.

- **Indexes.** Migration `003` adds indexes for the common filters and sorts.
- **Sorting.** "Rating" and "discount" sorts put NULL values last using `COALESCE` inside the specification, because Hibernate's Criteria API doesn't support `NULLS LAST`.
- **Cache.** Spring Cache on Redis:
  - Per-cache TTL is 60 s, and cache keys are built from the normalised search criteria.
  - Writes evict entries only after the transaction commits (`transactionAware`), so readers never cache data that was rolled back.
  - Deserialization uses a restricted polymorphic type validator, which allows only QuickKart DTO and JDK types.
  - A `CacheErrorHandler` logs Redis failures and lets the request fall through to PostgreSQL, so a Redis outage only slows the catalog down rather than breaking it.
- **Staleness.** The design is bounded staleness: after an admin edit, listings may be up to 60 s old. Checkout always reads live stock under a lock, so a stale page can never cause an oversell.

---

## Checkout

```mermaid
sequenceDiagram
    participant C as Customer
    participant O as Order service
    participant DB as PostgreSQL
    C->>O: POST /orders/checkout (idempotencyKey, cartFingerprint, address)
    O->>DB: BEGIN, lock user row
    O->>DB: same key already used? → return that order (or 409 if details differ)
    O->>DB: lock each product row FOR UPDATE, check stock
    O->>DB: insert order + items + payment(COD, COLLECTION_PENDING), decrement stock, clear cart
    O->>DB: insert outbox_events row (same transaction)
    O->>DB: COMMIT
    O-->>C: 201 order
```

- **Cart fingerprint.** A hash of the cart's contents and prices that the customer confirmed. If the cart changed in another tab, checkout fails instead of charging for something the customer didn't see.
- **Idempotency key.** Generated per checkout attempt in the browser. A retry after a timeout returns the original order.
- **Order lifecycle.** `PLACED → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, one step at a time. An order can be cancelled before it ships, and cancellation puts the stock back. Marking a COD order `DELIVERED` sets its payment to `COLLECTED`.
- **Online payments (simulated gateway).** A UPI or card checkout creates the order in `PENDING` with a `PENDING` payment; the stock is already reserved. `POST /api/orders/{id}/pay` plays the gateway callback: success sets the payment `PAID` and the order `PLACED` (a repeated success is idempotent), failure sets `FAILED` and the customer can retry. `UnpaidOrderExpiry` runs every minute and cancels orders still unpaid after 30 minutes, each in its own transaction under the order's row lock, so a payment arriving at the same moment either wins or sees `CANCELLED`. Cancelling a paid order marks it `REFUNDED`. Collected revenue counts `PAID` and `COLLECTED` payments.
- **Stock history.** Every stock change (checkout, cancellation, admin restock / correction / edit) writes a `stock_movements` row in the same transaction as the change.

---

## Order events: outbox → Kafka → email

```mermaid
flowchart LR
    T["checkout transaction"] -->|"BEFORE_COMMIT"| OB[("outbox_events")]
    OB -->|"every 1 s, oldest first"| R["OutboxRelay"]
    R -->|"acks=all, idempotent producer, key = orderId"| K{{"quickkart.order-events"}}
    K --> C["OrderNotificationConsumer (monolith)"]
    C -->|"eventId seen?"| PE[("processed_events")]
    C -->|"new"| E["email: confirmation, payment, shipped, delivered, cancelled"]
    C -->|"3 retries failed"| D{{"quickkart.order-events.DLT"}}
```

Events on the topic (all written through the outbox, keyed by order id so one order's events stay in order):

| Event | Written when | Email |
|---|---|---|
| `ORDER_CREATED` | checkout | order confirmation (COD orders; online orders wait for the payment) |
| `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` | `/pay` | payment received / payment failed, with how to retry |
| `ORDER_STATUS_CHANGED` | every status change | shipped, out for delivery, delivered, cancelled (with refund note); none for internal steps |

Event ids are deterministic (`ORDER_STATUS-41-SHIPPED`), so a retried write or a redelivery is de-duplicated.

Why not publish to Kafka directly after commit? If the process dies or Kafka is down between the commit and the send, the event is lost. With the outbox:

- The event row commits or rolls back **with** the order, so there are no ghost events and no missing events.
- The relay publishes rows oldest-first and stops at the first failure, which preserves per-order ordering. The failed row stays pending, with `attempts` and `last_error` recorded, and is retried on the next tick.
- Delivery is **at least once**. After sending the email, the consumer stores the event's `eventId` in `processed_events` (primary key), and a redelivered event that is already recorded is skipped. Narrow edge case: if the process crashes after the email is sent but before the row is saved, the email can be sent twice. That is the usual trade-off when the side effect (SMTP) can't join a database transaction.
- A message that still fails after 3 retries, 2 s apart, goes to the dead-letter topic instead of blocking the partition.
- The admin **System** page shows how many outbox rows are pending, and reports DOWN if any row has waited more than 2 minutes.

---

## Observability

- Every service has a `/actuator/health` endpoint, and Docker Compose health checks gate container start-up order.
- `X-Correlation-ID` is created at the gateway (or accepted from the client), passed downstream, and put in the SLF4J MDC, so one request can be followed through all service logs.
- `GET /api/admin/system/status` probes each dependency with a 2 s timeout. It returns only UP/DOWN, latency, and a fixed description, never hostnames or exception text.
- Errors return a JSON body with a safe message. `500` responses never include exception details; those go to the log.

## Schema migrations

The init script creates the schema as of V5 on an empty volume. Later changes are Flyway migrations (`infrastructure/postgres/migrations/V<n>__*.sql`) applied by a one-shot `db-migrate` container before any service starts (`depends_on: service_completed_successfully`). Older databases are baselined at V5. In `prod`, Hibernate only validates the schema, so a missing migration stops the service at startup instead of letting it change tables.

## Browser security and network surface

- nginx sends a strict **Content-Security-Policy** (`script-src 'self'`, no inline scripts: the theme pre-paint script is a file), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` and a restrictive `Permissions-Policy`. The CSP matters most because the JWT is kept in `localStorage`: it blocks injected scripts from reading it.
- Redis requires a password (`requirepass`); the services pass it from `.env`.
- Only nginx (:3000) and the gateway (:8080) are meant to be reached from outside. PostgreSQL, Redis, Kafka and the three services are published on `127.0.0.1` only (for local debugging) and talk to each other on the Compose network. The production overlay removes those ports entirely.
