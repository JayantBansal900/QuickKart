# API reference

Every call goes through the gateway at `http://localhost:8080`. Bodies are JSON. Authenticated endpoints need `Authorization: Bearer <jwt>` from `/api/auth/login`.

Errors share one shape:

```json
{ "timestamp": "…", "status": 400, "error": "Bad Request", "message": "human-readable, safe to show", "path": "/api/…" }
```

| Status | Meaning |
|---|---|
| 400 | validation failed / bad parameter |
| 401 | missing, expired or revoked token; wrong credentials |
| 403 | logged in but wrong role |
| 404 | not found (also used for another customer's order) |
| 409 | conflict: stock, state transition, duplicate email or category, reused idempotency key, category still in use |
| 429 | rate limited |
| 503 | email could not be sent; the signup was rolled back |

---

## Auth — monolith

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/auth/register` | – | `name, email, password, phoneNumber?` | `201`, account `PENDING_VERIFICATION`, code emailed. No token. Registering again with an email that was never verified restarts the signup with a fresh code; a verified email gives `409`. |
| POST | `/api/auth/verify-otp` | – | `email, otp` | `200` account active |
| POST | `/api/auth/resend-otp` | – | `email` | `200` generic message |
| POST | `/api/auth/login` | – | `email, password` | `200 { token, id, name, email, role, emailVerified, accountStatus }` |
| GET | `/api/auth/me` | user | – | current account |
| POST | `/api/auth/forgot-password` | – | `email` | `200` generic message (same for unknown emails) |
| POST | `/api/auth/reset-password` | – | `email, otp (6 digits), newPassword (6–128)` | `200`. All existing tokens for the account stop working. |

OTP rules:
- A code expires after 5 minutes and allows at most 5 wrong attempts.
- A code is single-use, and a code from one purpose (sign-up or reset) doesn't work for the other.

Rate limits are listed in [architecture.md](architecture.md#authentication-and-account-security).

## Profile — monolith

| Method | Path | Auth | Body |
|---|---|---|---|
| GET | `/api/user/profile` | user | – |
| PUT | `/api/user/profile` | user | `name, phoneNumber?, savedAddress?` (≤ 1000 chars; omit to keep, `""` to remove). The saved address pre-fills checkout. |

## Catalog — product service

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/products` | – | Search. See parameters below. Returns `{ content, page, size, totalElements, totalPages, last }` |
| GET | `/api/products/categories` | – | `[{ category, count }]` (on-sale products per category) |
| GET | `/api/categories` | – | active categories in display order: `[{ id, key, name, description, imageUrl, sortOrder, active, productCount }]`. `key` is the value for `?category=`. |
| GET | `/api/products/{id}` | – | one product |
| GET | `/api/products/images/{name}` | – | an uploaded product photo (cached for a year; names are random UUIDs) |

Search parameters (all optional):

| Param | Rule |
|---|---|
| `q` | ≤ 100 chars. Matches name, brand, description and category. |
| `category` | exact category, ≤ 60 chars |
| `minPrice`, `maxPrice` | 0 – 10,000,000, with min ≤ max |
| `sort` | `featured` (default), `price-asc`, `price-desc`, `rating-desc`, `discount-desc`, `popular` (most reviews), `newest`, `name` |
| `page`, `size` | page ≥ 0 (≤ 10,000); size 1–48 (default 24) |

Product fields:

| Group | Fields |
|---|---|
| Identity | `id`, `name`, `description`, `brand`, `category`, `sku` |
| Price | `price`, `discountPercentage` |
| Reviews | `rating`, `reviewCount` |
| Stock | `stockQuantity`, `availability` (`IN_STOCK` / `OUT_OF_STOCK` / `DISCONTINUED`) |
| Images | `imageUrl`, `thumbnailUrl` |

Responses are cached in Redis for up to 60 s.

### Reviews — product service

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/products/{id}/reviews?page=&size=` | – | newest first, `size` ≤ 20. Each review: `id, authorName ("Priya S."), rating, title, comment, verifiedPurchase, mine, createdAt`. The author's email is never returned. |
| GET | `/api/products/{id}/reviews/eligibility` | user | `{ canReview, reason, myReview }` |
| POST | `/api/products/{id}/reviews` | user | `{ rating: 1–5, title? (≤120), comment? (≤2000) }`. Only customers with a **delivered** order containing the product (`403` otherwise). Writing again edits the same review. The product's `rating` and `reviewCount` are updated in the same transaction. |
| DELETE | `/api/products/{id}/reviews/{reviewId}` | user | your own review only |

## Cart — order service

| Method | Path | Auth | Body |
|---|---|---|---|
| GET | `/api/cart` | user | – returns items, totals and a `fingerprint` |
| POST | `/api/cart/items` | user | `productId, quantity` |
| PUT | `/api/cart/items/{productId}` | user | `quantity` |
| DELETE | `/api/cart/items/{productId}` | user | – |
| DELETE | `/api/cart` | user | – clear the cart |

## Orders — order service

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/orders/checkout` | user | See the body below. Returns `201` with the order. |
| GET | `/api/orders` | user | the caller's orders, newest first |
| GET | `/api/orders/{id}` | user | only the caller's own order; otherwise `404` |
| GET | `/api/orders/payment-methods` | user | `{ "methods": ["COD","UPI","CARD"] }`, or only `["COD"]` when the simulated gateway is off (always in `prod`). |
| POST | `/api/orders/{id}/pay` | user | Simulated gateway (test mode): `{ "outcome": "SUCCESS" \| "FAILURE" }`. Success: payment `PAID`, order `PENDING → PLACED` (repeating it returns the same order). Failure: payment `FAILED`, the order stays payable. `409` for COD orders or orders no longer waiting for payment. |
| POST | `/api/orders/{id}/cancel` | user | Allowed before shipping. Stock is restored; a paid online order is refunded (`REFUNDED`). |

Checkout body:

```json
{
  "paymentMethod": "COD | UPI | CARD",
  "idempotencyKey": "uuid generated once per attempt",
  "cartFingerprint": "from GET /api/cart",
  "recipientName": "Asha Verma",
  "deliveryAddress": "12 MG Road, Bengaluru 560001",
  "deliveryPhone": "9876543210"
}
```

- Re-sending the same `idempotencyKey` returns the same order.
- Reusing the key with different details → `409`.
- If the cart changed since the fingerprint was taken → `409`, refresh and confirm again.
- Not enough stock → `409`.

Order and payment states:

| Payment method | After checkout | Then |
|---|---|---|
| `COD` | order `PLACED`, payment `COLLECTION_PENDING` | payment `COLLECTED` when the order is delivered, `CANCELLED` if the order is cancelled |
| `UPI` / `CARD` | order `PENDING`, payment `PENDING`, `payable: true` | `/pay` success → order `PLACED`, payment `PAID`; failure → payment `FAILED` (retry allowed); not paid within 30 minutes → order `CANCELLED` by `SYSTEM`, stock released; cancelled after payment → `REFUNDED` |

Each order response also has `cancellable` and `payable` flags for the UI.

---

## Admin (role `ADMIN`)

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/admin/analytics` | monolith | booked and collected revenue, totals, orders awaiting fulfilment, low-stock (1–4 left) and out-of-stock counts |
| GET | `/api/admin/analytics/insights?days=30` | monolith | `days` 7–365. Revenue, orders and verified sign-ups per day (every day present), orders by status, payment methods, top 5 products by units, revenue by category |
| GET | `/api/admin/system/status` | monolith | UP/DOWN and latency for PostgreSQL, Redis, Kafka, product service, order service, outbox backlog |
| GET | `/api/admin/users?q=&role=&status=&page=&size=` | monolith | paged (size ≤ 100, default 25), newest first; `q` matches name, email or exact id |
| GET | `/api/admin/users/{id}` | monolith | one user |
| PATCH | `/api/admin/users/{id}/status` | monolith | `{ status: ACTIVE \| SUSPENDED \| DISABLED \| PENDING_VERIFICATION }`. Not allowed on yourself or another admin (`409`). |
| GET | `/api/admin/orders?q=&status=&page=&size=` | order service | paged, newest first; `q` matches order id (`#41` or `41`), customer email or recipient |
| GET | `/api/admin/orders/{id}` | order service | one order |
| PATCH | `/api/admin/orders/{id}/status` | order service | `{ status }`, one step at a time: `PLACED → CONFIRMED → PROCESSING → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`. `CANCELLED` is allowed before `SHIPPED`. An unpaid online order (`PENDING`) can only be cancelled. Every change publishes an `ORDER_STATUS_CHANGED` event. |
| GET | `/api/admin/products?q=&category=&stock=&sort=&page=&size=` | product service | paged, including discontinued; `stock` = `ALL` \| `LOW` (under 5) \| `OUT`; `sort` = `newest` (default) \| `stock` (lowest first) |
| GET | `/api/admin/products/{id}/stock-movements?page=&size=` | product service | every stock change, newest first: `{ change, stockAfter, reason, reference, actor, createdAt }`; reasons `ORDER_PLACED`, `ORDER_CANCELLED`, `RESTOCK`, `CORRECTION`, `ADMIN_EDIT`, `INITIAL_STOCK` |
| POST | `/api/admin/products` | product service | create a product (fields as above); `category` must be an existing category name (any case) |
| PUT | `/api/admin/products/{id}` | product service | update a product |
| PATCH | `/api/admin/products/{id}/stock` | product service | `{ adjustment: -100000…100000, non-zero }`. The row is locked during the update, and stock can't go below 0 (`400`). |
| POST | `/api/admin/products/{id}/image` | product service | multipart field `file`: JPEG, PNG or WebP up to 3 MB. The type is checked from the file's bytes, not its name. Replaces (and deletes) the previous uploaded photo. |
| DELETE | `/api/admin/products/{id}` | product service | `409` if the product is in an order or cart; also deletes its uploaded photo |
| DELETE | `/api/admin/products/{id}/reviews/{reviewId}` | product service | remove any review (moderation); the rating is recalculated |
| GET | `/api/admin/categories` | product service | all categories, including hidden ones |
| POST | `/api/admin/categories` | product service | `{ name, description?, imageUrl? (site path or https URL), sortOrder?, active? }`; duplicate name (any case) → `409` |
| PUT | `/api/admin/categories/{id}` | product service | same body; renaming also renames the category on its products |
| DELETE | `/api/admin/categories/{id}` | product service | `409` while products still use it (hide it instead) |

## Health

`GET /actuator/health` on the gateway (and on each service's own port) returns `{ "status": "UP" }`.
