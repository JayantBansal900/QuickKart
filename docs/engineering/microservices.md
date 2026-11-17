# Microservices Architecture & Decoupling Rationale

This document details the architectural decisions, service boundaries, and decomposition strategy used in QuickKart.

## 1. Domain Decomposition Rationale

QuickKart evolved from a monolithic Spring Boot backend into a multi-service hybrid architecture to address scalability, fault isolation, and developer workflow efficiency.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          API Gateway (:8080)                           │
└───────────────┬────────────────────────┬───────────────────────┬───────┘
                │                        │                       │
                ▼                        ▼                       ▼
┌───────────────────────────┐┌────────────────────────┐┌──────────────────────┐
│  Monolith Service (:8081) ││ Product Service (:8082)││ Order Service (:8083)│
│  - User Auth & JWT        ││ - Product Catalog CRUD ││ - Persistent Cart    │
│  - User Profiles          ││ - Stock Queries        ││ - Order Placement    │
│  - Payment Processing     ││ - Public Search & Read ││ - Stock Locking      │
│  - Legacy Endpoints       ││ - Redis Product Cache  ││ - Kafka Events       │
└───────────────────────────┘└────────────────────────┘└──────────────────────┘
```

### Why Break Out Product & Order Services?
1. **High Read-to-Write Ratio for Products**: Product catalog browsing accounts for ~90% of traffic. Extracting `Product Service` enables independent horizontal scaling and caching without impacting payment or auth code.
2. **Transactional Complexity in Orders**: Order placement requires distributed locks, stock verification, cart management, and event publishing. Isolating `Order Service` prevents cart operations from blocking user login or profile operations.
3. **Legacy Preservation in Monolith**: Auth and Payments remain safely hosted in the Monolith service, preserving verified business logic while microservices scale around it.

---

## 2. Service Boundaries & API Contracts

| Service | Port | Database Domain | External API Base | Dependency Direction |
|---|---|---|---|---|
| Monolith | 8081 | `users`, `roles`, `payments` | `/api/auth`, `/api/payments` | Independent |
| Product Service | 8082 | `products`, `categories` | `/api/products`, `/api/admin/products` | Independent |
| Order Service | 8083 | `carts`, `cart_items`, `orders`, `order_items` | `/api/cart`, `/api/orders` | Reads product info; Emits Kafka events |

---

## 3. Database Strategy: Multi-Schema Relational Storage

QuickKart uses PostgreSQL with logical schema boundaries per service:
- Services access dedicated tables and do not perform cross-database JOIN queries.
- When `Order Service` needs product details (e.g. name, price), it receives the product ID in request payloads and validates details via lightweight internal service call or product snapshot.

---

## 4. API Gateway Routing & Reverse Proxy

The **Spring Cloud API Gateway** (`:8080`) serves as the single facade:
- Prevents CORS issues across microservices by centralizing CORS headers (`Access-Control-Allow-Origin: http://localhost:3000`).
- Provides uniform authorization token extraction.
- Maps public routes seamlessly without exposing internal port layouts to clients.
