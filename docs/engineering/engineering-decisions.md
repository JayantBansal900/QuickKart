# QuickKart Architectural & Engineering Decisions (ADR)

This document details the core architectural design decisions, technology choices, trade-offs, and design patterns established across the QuickKart e-commerce platform.

---

## 1. Core Technology Stack Rationale

### A. Java 17 LTS & Spring Boot 3.3.4
- **Decision:** Standardize all backend microservices (`monolith`, `product-service`, `order-service`, `api-gateway`) on Java 17 and Spring Boot 3.3.4.
- **Rationale:**
  - **Java 17 LTS:** Provides language enhancements (Records, Pattern Matching, Sealed Classes, Text Blocks) alongside improved garbage collection (ZGC / G1GC improvements) and long-term enterprise support.
  - **Spring Boot 3.3.4:** Fully compliant with Jakarta EE 10, Spring Framework 6, and modern cloud-native dependencies. Integrates seamlessly with Spring Data JPA, Spring Security 6, and Spring Cloud Gateway.

### B. PostgreSQL Primary Database
- **Decision:** Utilize PostgreSQL 16 as the authoritative relational data store.
- **Rationale:**
  - Strict ACID guarantees for customer accounts, product catalog, cart state, and financial order history.
  - Robust row-level pessimistic locking (`SELECT FOR UPDATE`) to guarantee zero overselling during high-concurrency checkouts.
  - Referential integrity via primary and foreign key constraints across `users`, `products`, `orders`, `order_items`, and `cart_items`.

### C. Redis Cache-Aside Layer
- **Decision:** Deploy Redis 7 for high-speed read acceleration on the product catalog.
- **Rationale:**
  - Product catalog reads outweigh writes by orders of magnitude (100:1 read-to-write ratio).
  - Cache-Aside pattern via Spring `@Cacheable` reduces PostgreSQL CPU utilization and query load.
  - Invalidation strategy: `@CacheEvict(value = "products", key = "#id")` on administrative mutations (`PUT`, `DELETE`) guarantees cache consistency without stale reads.
  - Graceful Fallback: Built-in `CacheErrorHandler` ensures that if Redis goes offline, product queries fall back directly to PostgreSQL without causing HTTP 500 errors.

---

## 2. Event-Driven Messaging with Apache Kafka

### A. Kafka for Asynchronous Event Processing
- **Decision:** Implement Apache Kafka (Confluent 7.6.0) for event-driven asynchronous communication between microservices.
- **Rationale:**
  - Decouples checkout completion from downstream notification, analytics, and inventory audit processors.
  - High message throughput, durable disk persistence, and partitionable consumer scaling.

### B. Transactional Event Listener Pattern (`AFTER_COMMIT`)
- **Decision:** Bind Kafka event publishing to `@TransactionalEventListener(phase = AFTER_COMMIT)`.
- **Rationale:**
  - **The Phantom Event Problem:** Publishing Kafka events inside an active database transaction risks emitting an event before the database commit succeeds. If the DB transaction rolls back, downstream services execute operations for non-existent orders.
  - **The Solution:** By postponing event publishing until the database transaction successfully commits (`AFTER_COMMIT`), QuickKart guarantees that events are only emitted for fully persisted database changes.

---

## 3. Microservice Decomposition Strategy

```
                      +------------------------+
                      |   React Frontend       |
                      |   Port 3000 (Vite)     |
                      +-----------+------------+
                                  |
                                  v
                      +------------------------+
                      |  Spring Cloud Gateway  |
                      |   Port 8080            |
                      +-----------+------------+
                                  |
         +------------------------+------------------------+
         |                        |                        |
         v                        v                        v
+----------------+       +----------------+       +----------------+
|    Monolith    |       | Product Service|       | Order Service  |
|   Port 8081    |       |   Port 8082    |       |   Port 8083    |
| (Auth, Admin,  |       | (Catalog Read, |       | (Cart, Atomic  |
|  Legacy Auth)  |       |  Redis Cache)  |       | Checkout, Lock)|
+----------------+       +----------------+       +----------------+
```

### Strategic Boundaries:
1. **Monolith (`:8081`):** Retains Authentication (`/api/auth/**`), user registration, JWT generation, and legacy admin services. Preserves existing business logic while allowing microservice extraction.
2. **Product Service (`:8082`):** Pure catalog microservice owning `/api/products/**` and `/api/admin/products/**`. Manages Redis caching autonomously.
3. **Order Service (`:8083`):** Critical transactional microservice owning `/api/cart/**` and `/api/orders/**`. Handles cart persistence, pessimistic inventory locking, atomic checkout, and Kafka event emission.

---

## 4. API Gateway & Tracing Architecture

### A. Spring Cloud Gateway (`:8080`)
- **Decision:** Deploy Spring Cloud Gateway as the single reverse-proxy entry point for all frontend and client communications.
- **Rationale:**
  - **Unified Entry Point:** Clients only interact with port 8080, masking internal microservice topologies.
  - **CORS Management:** Centralized CORS configuration eliminates duplicated headers across microservices.
  - **Route Aggregation:** Routes requests deterministically (`/api/auth/**` -> 8081, `/api/products/**` -> 8082, `/api/cart/**` & `/api/orders/**` -> 8083).

### B. Zero-Dependency MDC Tracing (`X-Correlation-ID`)
- **Decision:** Implement a lightweight custom correlation ID filter across API Gateway and Spring Boot microservices.
- **Rationale:**
  - Assigns or forwards a unique `X-Correlation-ID` header for every incoming HTTP request.
  - Injects the correlation ID into SLF4J's Mapped Diagnostic Context (MDC), ensuring all log statements contain `%X{correlationId}`.
  - Provides end-to-end request traceability across microservices without external tracing heavy dependencies.

---

## 5. Security & Authentication Model

1. **Stateless JWT Tokens:** Authentication emits signed HMAC-SHA256 JWT tokens containing `userId`, `email`, and `roles`.
2. **Role-Based Access Control (RBAC):**
   - Public read access for product browsing (`GET /api/products/**`).
   - Authenticated user access (`ROLE_USER` or `ROLE_ADMIN`) for cart management and checkout (`/api/cart/**`, `/api/orders/**`).
   - Strict admin access (`ROLE_ADMIN`) for administrative product creation, updates, and deletions (`/api/admin/products/**`).
3. **Password Security:** Password hashing via BCrypt with strength factor 10.
4. **Environment Isolation:** Zero hardcoded secrets in repository code; runtime injection via environment variables (`JWT_SECRET`, `SPRING_DATASOURCE_PASSWORD`).

---

## 6. Deployment & Containerization Strategy

1. **Docker Compose Parity:** `docker-compose.yml` orchestrates all 8 services using internal container network `quickkart-network`.
2. **Multi-Stage Builds:** Dockerfiles utilize multi-stage Maven/Node builds to generate slim, optimized production container images (`eclipse-temurin:17-jre-jammy` and `nginx:alpine`).
3. **Healthchecks & Resilience:** Every container service defines explicit healthchecks and `restart: unless-stopped` restart policies.
4. **Cloud Readiness:** Architecture fully prepared for AWS ECS Fargate container deployment with RDS PostgreSQL, ElastiCache Redis, and Amazon MSK Kafka.
