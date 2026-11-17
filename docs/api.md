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
| 409 | conflict: stock, state transition, duplicate email, reused idempotency key |
| 429 | rate limited |
| 501 | online payment (not built) |
| 503 | email could not be sent; the signup was rolled back |

---

## Auth — monolith

| Method | Path | Auth | Body | Result |
|---|---|---|---|---|
| POST | `/api/auth/register` | – | `name, email, password, phoneNumber?` | `201`, account `PENDING_VERIFICATION`, code emailed. No token. |
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
| PUT | `/api/user/profile` | user | `name, phoneNumber` |

## Catalog — product service

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/products` | – | Search. See parameters below. Returns `{ content, page, size, totalElements, totalPages, last }` |
| GET | `/api/products/categories` | – | `[{ category, count }]` |
| GET | `/api/products/{id}` | – | one product |

Search parameters (all optional):

| Param | Rule |
|---|---|
| `q` | ≤ 100 chars. Matches name, brand, description and category. |
| `category` | exact category, ≤ 60 chars |
| `minPrice`, `maxPrice` | 0 – 10,000,000, with min ≤ max |
| `sort` | `featured` (default), `price-asc`, `price-desc`, `rating-desc`, `discount-desc`, `newest`, `name` |
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
| POST | `/api/orders/{id}/cancel` | user | Allowed before shipping. Stock is restored. |

Checkout body:

```json
{
  "paymentMethod": "COD",
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

## Payments — monolith

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/payments/order/{orderId}` | user | payment record for an order: COD, `COLLECTION_PENDING` → `COLLECTED` on delivery |
| POST | `/api/payments` | user | `501 Not Implemented`. There is no online payment gateway. |

---

## Admin (role `ADMIN`)

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/admin/analytics` | monolith | revenue collected, order counts by status, pending orders, low-stock products (1–4 left) |
| GET | `/api/admin/system/status` | monolith | UP/DOWN and latency for PostgreSQL, Redis, Kafka, product service, order service, outbox backlog |
| GET | `/api/admin/users` | monolith | all users |
| GET | `/api/admin/users/{id}` | monolith | one user |
| PATCH | `/api/admin/users/{id}/status` | monolith | `{ status: ACTIVE \| SUSPENDED \| DISABLED \| PENDING_VERIFICATION }`. Not allowed on yourself or another admin (`409`). |
| GET | `/api/admin/orders` | order service | all orders |
| GET | `/api/admin/orders/{id}` | order service | one order |
| PATCH | `/api/admin/orders/{id}/status` | order service | `{ status }`, following `PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`. `CANCELLED` is allowed before `SHIPPED`. |
| GET | `/api/admin/products` | product service | all products, including out of stock |
| POST | `/api/admin/products` | product service | create a product (fields as above) |
| PUT | `/api/admin/products/{id}` | product service | update a product |
| PATCH | `/api/admin/products/{id}/stock` | product service | `{ adjustment: -100000…100000, non-zero }`. The row is locked during the update, and stock can't go below 0 (`400`). |
| DELETE | `/api/admin/products/{id}` | product service | `409` if the product is in an order or cart |

## Health

`GET /actuator/health` on the gateway (and on each service's own port) returns `{ "status": "UP" }`.
