# QuickKart Backend

## 1. Project Name
**QuickKart Backend** (`quickkart-backend`)

## 2. Current Phase
**Phase 3 — Redis Caching (Cache-Aside Pattern)**

This phase introduces a distributed Redis caching layer for read-heavy product catalog operations while preserving PostgreSQL as the authoritative source of truth. Built on Spring Boot 3.3.4, Spring Data Redis, PostgreSQL, and Spring Security 6.

### Architecture Overview:
```
Client Request (with Authorization: Bearer <token>)
  │
  ▼
JwtAuthenticationFilter (OncePerRequestFilter)
  ├── Extract "Bearer <token>"
  ├── Validate HMAC signature and expiry via JwtService
  ├── Extract claims (email, role, id, name)
  └── Populate SecurityContextHolder with UsernamePasswordAuthenticationToken (authorities: ROLE_<role>)
  │
  ▼
SecurityFilterChain (Spring Security 6 / Spring Boot 3.3.4)
  ├── CSRF: Disabled (stateless REST architecture)
  ├── SessionManagement: STATELESS (no server-side sessions)
  ├── Exception Handling: CustomAuthenticationEntryPoint (401) & CustomAccessDeniedHandler (403)
  └── Authorization Rules:
        ├── Public: /api/hello, /api/auth/register, /api/auth/login, GET /api/products/**
        ├── Authenticated Users: /api/auth/me, /api/cart/**, /api/orders/**, /api/payments/**
        └── Admin-Only: /api/admin/**, POST/PUT/DELETE /api/products/** (Requires ROLE_ADMIN)
  │
  ▼
Controller Layer:
  ├── AuthController (/api/auth/**)
  ├── ProductController (GET /api/products/**)
  ├── AdminProductController (/api/admin/products/**) [ADMIN]
  ├── CartController (/api/cart/**) [USER]
  ├── OrderController (/api/orders/**) [USER]
  ├── AdminOrderController (/api/admin/orders/**) [ADMIN]
  ├── PaymentController (/api/payments/**) [USER]
  └── HelloController (/api/hello) [PUBLIC]
  │
  ▼
Service Layer:
  ├── AuthService (BCryptPasswordEncoder, JwtService)
  ├── ProductService (Catalog management, stock updates)
  ├── CartService (User-isolated cart, stock verification)
  ├── OrderService (Transactional checkout, pessimistic locking, admin status updates)
  └── PaymentService (Mock payment processing, order ownership, idempotency)
  │
  ▼
Repository Layer:
  ├── UserRepository
  ├── ProductRepository (findByIdForUpdate with PESSIMISTIC_WRITE lock)
  ├── CartRepository & CartItemRepository
  ├── OrderRepository & OrderItemRepository
  └── PaymentRepository
  │
  ▼
PostgreSQL Database ("quickkart" schema):
  User (1) ──── (1) Cart (1) ──── (N) CartItem (N) ──── (1) Product
    │
    ├─────────── (N) Order (1) ─── (N) OrderItem (N) ──── (1) Product
    │                  │
    └──────────────────┴────────── (1) Payment (1:1 with Order)
```

---

## 3. Database Relationships & Entity Model

```
User
  │
  ├── (1:1) Cart
  │           │
  └──         └── (1:N) CartItem ──── (N:1) ────> Product
  │
  └── (1:N) Order
              │
              ├── (1:N) OrderItem ──── (N:1) ────> Product
              │
              └── (1:1) Payment
```

1. **User - Cart (1:1)**: Each registered user has one active cart.
2. **Cart - CartItem (1:N)**: Line items in the cart referencing `Product` with positive quantities.
3. **User - Order (1:N)**: Historical orders created via atomic cart checkout.
4. **Order - OrderItem (1:N)**: Price snapshots captured at checkout time.
5. **Order - Payment (1:1)**: Records transaction ID, payment method, amount, status, and payment timestamp.
6. **User - Role**: Stored as `"USER"` or `"ADMIN"`. Mapped to Spring Security `ROLE_USER` or `ROLE_ADMIN`.

---

## 4. Business Rules & Security Guarantees

### User Isolation & Authorization
* **No Spoofed User IDs**: The client never supplies a `userId`. All operations derive the user identity and role from the cryptographically verified JWT token.
* **Order Ownership**: Users can only pay for and inspect payments of their own orders. Attempting to pay for another user's order returns `403 Forbidden` (`UnauthorizedPaymentAccessException`).
* **Admin Privilege Enforcement**: Endpoints under `/api/admin/**` and product write operations strictly require the `ADMIN` role. Normal users receive `403 Forbidden`. Unauthenticated requests receive `401 Unauthorized`.

### Payment Processing Rules
* **Allowed Payment Methods**:
  * `CARD`
  * `UPI`
  * `COD`
  *(Exact case-sensitive matching. Any other value returns `400 Bad Request` with `InvalidPaymentMethodException`)*.
* **Payment Idempotency**: An order can only be paid once. Subsequent payment attempts return `409 Conflict` with `DuplicatePaymentException`.
* **Amount Matching**: The payment record automatically matches the exact `totalAmount` of the referenced order.
* **Mock Success**: All valid payments are marked `SUCCESS` and assigned a unique `UUID` transaction ID.

### Order Status Transition Rules
* **Allowed Order Statuses**:
  * `CONFIRMED`
  * `PROCESSING`
  * `SHIPPED`
  * `DELIVERED`
  * `CANCELLED`
  *(Exact case-sensitive matching. Any other value returns `400 Bad Request` with `InvalidOrderStatusException`)*.
* **Admin Status Updates**: Only an administrator can update the status of any order across the platform via `PATCH /api/admin/orders/{id}/status`.

### Public Registration vs. Admin Creation
* **Public Registration (`POST /api/auth/register`)**:
  * Must **NEVER** assign the `ADMIN` role.
  * Every public registration is unconditionally assigned `role: "USER"`.
  * If a client attempts to pass `"role": "ADMIN"` in the JSON payload, it is ignored and sanitized to `"USER"`.
* **Development/Testing Admin Account**:
  * Seeded securely on application startup by `DevAdminInitializer` using `application.properties`.
  * Runs only if `app.dev-admin.enabled=true` and no user with `app.dev-admin.email` exists.
  * Configure it through environment variables (e.g. in your local, gitignored `.env`):
    ```properties
    DEV_ADMIN_ENABLED=true
    DEV_ADMIN_EMAIL=dev-admin@quickkart.local
    DEV_ADMIN_PASSWORD=<at least 12 characters, never committed>
    ```
  * In production, this initializer is disabled by setting `app.dev-admin.enabled=false`, and admin accounts are provisioned via secure internal migrations or environment secrets.

---

## 5. Role Requirements by Endpoint Category

| Category | Endpoint | Method | Required Role | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Public** | `/api/hello` | `GET` | None (Public) | Health check |
| **Public** | `/api/auth/register` | `POST` | None (Public) | Register user (always USER role) |
| **Public** | `/api/auth/login` | `POST` | None (Public) | Login and receive JWT token |
| **Public** | `/api/products` | `GET` | None (Public) | List all products in catalog |
| **Public** | `/api/products/{id}` | `GET` | None (Public) | Get single product by ID |
| **Authenticated (USER)** | `/api/auth/me` | `GET` | USER or ADMIN | Verify current JWT claims |
| **Authenticated (USER)** | `/api/cart` | `GET` | USER | View authenticated user's cart |
| **Authenticated (USER)** | `/api/cart/items` | `POST` | USER | Add/increment cart item |
| **Authenticated (USER)** | `/api/cart/items/{productId}` | `PUT` | USER | Update cart item quantity |
| **Authenticated (USER)** | `/api/cart/items/{productId}` | `DELETE` | USER | Remove single cart item |
| **Authenticated (USER)** | `/api/cart` | `DELETE` | USER | Clear user's entire cart |
| **Authenticated (USER)** | `/api/orders` | `POST` | USER | Atomic checkout from cart |
| **Authenticated (USER)** | `/api/orders/checkout` | `POST` | USER | Checkout alias for cart |
| **Authenticated (USER)** | `/api/orders` | `GET` | USER | View user's own order history |
| **Authenticated (USER)** | `/api/orders/{id}` | `GET` | USER | View user's own single order |
| **Authenticated (USER)** | `/api/payments` | `POST` | USER | Process mock payment for order |
| **Authenticated (USER)** | `/api/payments/order/{orderId}`| `GET` | USER | View payment for user's order |
| **Admin-Only (ADMIN)** | `/api/admin/products` | `POST` | ADMIN | Create new product in catalog |
| **Admin-Only (ADMIN)** | `/api/admin/products` | `GET` | ADMIN | View all products with stock |
| **Admin-Only (ADMIN)** | `/api/admin/products/{id}` | `PUT` | ADMIN | Update product price & stock |
| **Admin-Only (ADMIN)** | `/api/admin/products/{id}` | `DELETE` | ADMIN | Delete product from catalog |
| **Admin-Only (ADMIN)** | `/api/products` | `POST` | ADMIN | Legacy path secured to ADMIN |
| **Admin-Only (ADMIN)** | `/api/admin/orders` | `GET` | ADMIN | View all customer orders |
| **Admin-Only (ADMIN)** | `/api/admin/orders/{id}` | `GET` | ADMIN | View any order by ID |
| **Admin-Only (ADMIN)** | `/api/admin/orders/{id}/status` | `PATCH` | ADMIN | Update order lifecycle status |

---

## 6. How to Run and Test

### Run All 89 Automated Tests
```bash
cd quickkart-backend
mvn test
```
*Executes all 89 unit and integration tests including Mock Payment processing, Admin Product APIs, Admin Order APIs, Public Registration security, Cart isolation, Atomic Checkout, Pessimistic Row Locking, JWT Authentication, and Global Exception Handling.*

### Start Application
```bash
mvn spring-boot:run
```
Backend runs on port `8081`.

---

## 7. Sample API Requests & Responses

### 1. Process Mock Payment (`POST /api/payments`)
**Headers:**
```http
Authorization: Bearer <USER_JWT_TOKEN>
Content-Type: application/json
```
**Request Body:**
```json
{
  "orderId": 1,
  "paymentMethod": "CARD"
}
```
**Response (HTTP 200 OK):**
```json
{
  "paymentId": 1,
  "orderId": 1,
  "paymentMethod": "CARD",
  "paymentStatus": "SUCCESS",
  "transactionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "amount": 199.99,
  "paymentDate": "2026-09-04T11:20:00"
}
```

### 2. Admin Create Product (`POST /api/admin/products`)
**Headers:**
```http
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```
**Request Body:**
```json
{
  "name": "Mechanical Keyboard RGB",
  "description": "Hot-swappable tactile switches with RGB backlighting",
  "price": 129.99,
  "stockQuantity": 35,
  "category": "Accessories"
}
```
**Response (HTTP 201 Created):**
```json
{
  "id": 5,
  "name": "Mechanical Keyboard RGB",
  "description": "Hot-swappable tactile switches with RGB backlighting",
  "price": 129.99,
  "stockQuantity": 35,
  "category": "Accessories"
}
```

### 3. Admin Update Order Status (`PATCH /api/admin/orders/{id}/status`)
**Headers:**
```http
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json
```
**Request Body:**
```json
{
  "status": "SHIPPED"
}
```
**Response (HTTP 200 OK):**
```json
{
  "orderId": 1,
  "totalAmount": 199.99,
  "status": "SHIPPED",
  "createdAt": "2026-09-04T10:15:30",
  "items": [...]
}
```

### 4. Non-Admin Access Rejection (`GET /api/admin/orders`)
**Attempted by USER role:**
**Response (HTTP 403 Forbidden):**
```json
{
  "status": 403,
  "error": "Forbidden",
  "message": "Access Denied: You do not have permission to access this resource"
}
```

---

## 7. Phase 3: Redis Caching Architecture & Implementation

### Caching Strategy: Cache-Aside Pattern
QuickKart employs the **Cache-Aside (Lazy-Loading)** pattern for product catalog reads:

```
Client Request
      │
      ▼
ProductController
      │
      ▼
ProductService
      │
      ▼
[ Redis Cache ] ──(Cache Hit)─────────────────────────► Return JSON
      │
 (Cache Miss)
      ▼
[ PostgreSQL DB ] (Authoritative Data Store)
      │
      ▼
[ Write to Redis Cache ] (with 5-minute TTL)
      │
      ▼
Return Response
```

### Redis Configuration
- **Host**: `localhost`
- **Port**: `6379`
- **Default TTL**: 5 minutes (`300,000` ms)
- **Serialization**: `GenericJackson2JsonRedisSerializer` with `@class` type metadata support and `JavaTimeModule` for ISO-8601 timestamps. Java native serialization is strictly avoided.
- **Null Value Caching**: Disabled (`disableCachingNullValues()`) to prevent caching transient database misses.

### Cache Names & Keys
| Cache Name | Key Expression | Cached Value Type | Operations |
|---|---|---|---|
| `products` | `#id` (e.g., `products::33`) | `ProductResponse` (JSON) | `GET /api/products/{id}` |
| `productList` | `'all'` (e.g., `productList::all`) | `List<ProductResponse>` (JSON) | `GET /api/products` |

### Cache Invalidation Strategy
To guarantee data consistency between Redis and the authoritative PostgreSQL database:
- **Product Creation (`createProduct`)**: Evicts the `productList` cache (`productList::all`), ensuring new products immediately appear in catalog listings.
- **Product Update (`updateProduct`)**: Evicts both the specific item cache (`products::{id}`) and the collection cache (`productList::all`), guaranteeing no stale prices or descriptions survive an admin update.
- **Product Deletion (`deleteProduct`)**: Evicts both the specific item cache (`products::{id}`) and the collection cache (`productList::all`), ensuring deleted items return 404 immediately.

### Why Caching is Restricted to Products
Redis is an optimization layer, **not** the source of truth. Caching is deliberately restricted to read-heavy, low-mutation catalog items:
1. **Inventory & Overselling**: Inventory checks and stock decrements rely on PostgreSQL with pessimistic row-level locking (`SELECT ... FOR UPDATE`). Caching inventory would risk race conditions, overselling, and phantom stock.
2. **Shopping Cart Isolation**: User carts are dynamic, session-bound, and per-user isolated. They are managed directly via transactional queries in PostgreSQL.
3. **Checkout & Payments**: Order creation and payment state transitions require strict ACID guarantees and financial idempotency. Caching checkout or payment records could cause duplicate charges or inconsistent order states.

