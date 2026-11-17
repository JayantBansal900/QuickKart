# QuickKart Software Engineering Interview Preparation Guide

This guide contains 35 rigorous technical questions and answers designed specifically for software engineering and backend technical interviews. All answers are based strictly on the actual implementation of the QuickKart codebase.

---

## Section 1: System Architecture & Core Stack

### Q1: What is the overall architecture of QuickKart?
**Answer:** QuickKart is a hybrid microservices e-commerce platform. It consists of a React + TypeScript frontend, a Spring Cloud Gateway (`:8080`), a core Monolith (`:8081` for Auth & Admin), a Product Microservice (`:8082` for Catalog & Redis Caching), an Order Microservice (`:8083` for Cart, Concurrency Locking & Atomic Checkout), PostgreSQL (`:5432`), Redis (`:6379`), and Apache Kafka (`:9092`).

### Q2: Why did you choose a hybrid microservices model instead of a pure monolith or 100% microservices?
**Answer:** QuickKart was evolved pragmatically. Authentication and legacy administrative tools reside in the Monolith to prevent premature optimization. High-read product catalog operations were extracted into the Product Service to allow independent caching and scaling. The transactional cart and checkout flows were extracted into the Order Service to isolate pessimistic locking, inventory safety, and Kafka event publishing.

### Q3: What technology stack is used for the backend microservices?
**Answer:** Java 17 LTS, Spring Boot 3.3.4, Spring Data JPA / Hibernate, Spring Security 6, JWT (io.jsonwebtoken), PostgreSQL 16, Redis 7, Confluent Apache Kafka 7.6.0, Maven, and Docker.

### Q4: How is configuration managed across different deployment environments?
**Answer:** QuickKart utilizes Spring Boot profiles (`dev` and `prod`). Common settings live in `application.yml`, while environment-specific parameters (like database credentials, Redis hosts, and Kafka bootstrap servers) are bound to environment variables specified in `.env` / system environment.

### Q5: How do microservices communicate with each other?
**Answer:** Client-to-service communication is routed via HTTP/REST through the Spring Cloud Gateway. Interservice asynchronous event notification (such as notifying downstream systems after an order is placed) is handled via Apache Kafka event streams.

### Q6: How is the database structured across microservices?
**Answer:** Currently, PostgreSQL hosts the schemas (`users`, `products`, `orders`, `order_items`, `cart_items`) accessed by JPA entities in their respective services. The architecture maintains explicit boundaries per service domain.

---

## Section 2: Microservices & API Gateway

### Q7: What role does Spring Cloud Gateway play in QuickKart?
**Answer:** Spring Cloud Gateway acts as the single reverse-proxy entry point (`:8080`). It routes requests based on URL paths (`/api/auth/**` -> 8081, `/api/products/**` -> 8082, `/api/cart/**` & `/api/orders/**` -> 8083), handles centralized CORS, and injects request tracing headers.

### Q8: How is cross-origin resource sharing (CORS) handled?
**Answer:** CORS is terminated at the API Gateway layer using Spring Cloud Gateway's global CORS configuration (`GatewayCorsConfig`). It allows requests from `http://localhost:3000` with standard HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`) and headers (`Authorization`, `Content-Type`, `X-Correlation-ID`).

### Q9: How do you trace a single request across multiple microservices?
**Answer:** QuickKart uses a custom `X-Correlation-ID` filter implemented in the Gateway and Spring Boot microservices. If an incoming request lacks a correlation ID, the Gateway generates a UUID. This ID is propagated via HTTP headers and stored in SLF4J's Mapped Diagnostic Context (MDC), ensuring all log lines print `%X{correlationId}`.

### Q10: What happens if the API Gateway goes down?
**Answer:** The Gateway is stateless. In production, multiple Gateway instances run behind a cloud load balancer (e.g., AWS Application Load Balancer). If one instance fails, the load balancer routes traffic to surviving Gateway instances.

### Q11: How does Product Service interact with Monolith and Order Service?
**Answer:** Product Service operates independently for reading products. Order Service queries product data and performs stock checks via repository access during checkout. Communication between services for post-checkout events occurs asynchronously via Kafka.

### Q12: How are static assets and frontend single-page application (SPA) routing handled?
**Answer:** In local development, Vite dev server handles HMR on port 3000. In production Docker deployment, Nginx serves the compiled React production bundle and proxies `/api` calls directly to the API Gateway.

---

## Section 3: Concurrency, Inventory Locking & Transactions

### Q13: How does QuickKart prevent overselling when multiple users buy the last item simultaneously?
**Answer:** QuickKart uses **Pessimistic DB Locking** (`SELECT FOR UPDATE`) in `ProductRepository`. When a user initiates checkout, `OrderService` executes `@Lock(LockModeType.PESSIMISTIC_WRITE)` on the requested product rows. This holds a row-level database lock, blocking concurrent checkout transactions until the first transaction completes.

### Q14: Why choose Pessimistic Locking over Optimistic Locking (`@Version`) for inventory?
**Answer:** Optimistic locking fails fast and throws `OptimisticLockException` under high contention, forcing users to retry their checkout. Pessimistic locking queues competing checkouts at the database level, ensuring that if stock is available, transactions succeed sequentially without user disruption.

### Q15: How are database transactions managed during checkout?
**Answer:** `OrderService.checkout()` is annotated with `@Transactional`. The entire sequence—fetching cart items, locking product stock, checking quantity, creating the order and order items, updating product stock, clearing the cart, and staging the Kafka event—executes within a single atomic database transaction.

### Q16: What happens if a user tries to checkout an item that is out of stock?
**Answer:** During checkout, stock validation checks if `product.getStockQuantity() < item.getQuantity()`. If insufficient, `OrderService` throws an `InsufficientStockException` (or `RuntimeException`), which rolls back the transaction completely, ensuring no partial order records or inventory deductions occur.

### Q17: How is the shopping cart state maintained?
**Answer:** Cart items are stored in PostgreSQL (`cart_items` table) linked to the user's account ID. This ensures cart persistence across sessions, devices, and browser restarts.

### Q18: What happens to cart items after a successful checkout?
**Answer:** Upon successful checkout completion inside the `@Transactional` boundary, `cartItemRepository.deleteByUserId(userId)` is invoked, clearing the user's cart automatically.

---

## Section 4: Event-Driven Architecture & Apache Kafka

### Q19: Where is Kafka used in QuickKart?
**Answer:** Kafka is used to publish `OrderPlacedEvent` payloads whenever an order is successfully checked out. Order Service acts as the producer on `order-placed-topic`.

### Q20: What is the `@TransactionalEventListener(phase = AFTER_COMMIT)` pattern and why is it critical?
**Answer:** Normal Spring `@EventListener` or standard event publishing fires immediately during the transaction. If the transaction later fails and rolls back, an event has already been sent to Kafka (a "phantom event"). By using `@TransactionalEventListener(phase = AFTER_COMMIT)`, QuickKart guarantees that Kafka messages are dispatched **only after** the PostgreSQL transaction has successfully committed.

### Q21: How are Kafka consumer offsets and consumer groups managed?
**Answer:** Microservices listen to topics using `@KafkaListener(topics = "order-placed-topic", groupId = "order-group")`. Kafka tracks committed offsets per consumer group, allowing horizontal scaling across multiple consumer instances.

### Q22: How do you handle duplicate Kafka events (idempotency)?
**Answer:** Downstream event consumers inspect the unique `orderId` or `eventUuid` within the `OrderPlacedEvent`. Consumers perform an idempotency check against a processed-events repository or table before executing logic, ignoring duplicate deliveries.

### Q23: How is Kafka configured for both local host development and Docker containers?
**Answer:** `docker-compose.yml` configures dual listeners on Kafka: `INTERNAL://kafka:29092` for container-to-container communication and `EXTERNAL://localhost:9092` for host machine / IDE test execution.

### Q24: What happens if the Kafka broker is temporarily offline during checkout?
**Answer:** Because event publication is bound to `AFTER_COMMIT`, a Kafka failure after DB commit can be retried or captured in an outbox/DLQ table, preventing the primary database transaction from breaking the user's order confirmation.

---

## Section 5: Caching & Database Performance

### Q25: Where is Redis used in QuickKart?
**Answer:** Redis is used in `Product Service` as a Cache-Aside layer for product catalog queries (`GET /api/products/{id}`).

### Q26: How does Spring's `@Cacheable` and `@CacheEvict` work in QuickKart?
**Answer:** `@Cacheable(value = "products", key = "#id")` checks Redis first. On a hit, it returns the cached DTO. On a miss, it executes the PostgreSQL query and writes the result to Redis. When an admin updates or deletes a product (`PUT` / `DELETE`), `@CacheEvict(value = "products", key = "#id")` clears the stale Redis entry.

### Q27: How does QuickKart handle Redis connection failure (Resilience / Fallback)?
**Answer:** `Product Service` implements a custom `CacheErrorHandler`. If Redis is unreachable or times out, the error is logged as a warning, and execution seamlessly falls back to PostgreSQL without throwing an error to the client.

### Q28: What is the observed performance difference between cold DB queries and warm Redis cache queries?
**Answer:** Empirical benchmarks demonstrate cold PostgreSQL queries take ~9.5 ms, while warm Redis cache hits respond in ~6.2 ms (a ~1.5x - 2x speedup on single node, with significantly higher advantages under heavy concurrent query load).

### Q29: How are database indexes utilized in QuickKart?
**Answer:** Primary keys are indexed by default. FK indexes exist on `order_items(order_id)`, `cart_items(user_id)`, and `orders(user_id)`. Product queries benefit from index scans on `category` and `id`.

### Q30: How is connection pooling configured?
**Answer:** HikariCP connection pooling is tuned with `maximum-pool-size: 10`, `minimum-idle: 5`, and `idle-timeout: 30000` across all Spring Boot microservices.

---

## Section 6: Security, Testing & Production Operations

### Q31: How is JWT authentication and authorization implemented?
**Answer:** Users authenticate at `POST /api/auth/login`. Monolith generates an HMAC-SHA256 signed JWT containing the user ID, email, and roles. Microservices validate the JWT using `JwtAuthenticationFilter` in Spring Security filter chain and populate `SecurityContextHolder`.

### Q32: How is Role-Based Access Control (RBAC) enforced?
**Answer:** Spring Security configuration specifies matcher rules:
- `requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()`
- `requestMatchers("/api/admin/**").hasRole("ADMIN")`
- `requestMatchers("/api/cart/**", "/api/orders/**").hasAnyRole("USER", "ADMIN")`

### Q33: How is automated testing structured across the project?
**Answer:** QuickKart has 142 total unit and integration tests across microservices. It utilizes JUnit 5, Mockito, Spring Boot Test (`@SpringBootTest`, `@WebMvcTest`), and isolation configurations (like distinct Kafka consumer group IDs per test class) to ensure zero cross-test pollution.

### Q34: How is Docker Compose structured for production-like execution?
**Answer:** `docker-compose.yml` orchestrates 8 services (`frontend`, `api-gateway`, `monolith`, `product-service`, `order-service`, `postgres`, `redis`, `kafka`). Services use multi-stage Dockerfiles, explicit healthchecks (`healthcheck:`), `depends_on:` condition checks (`service_healthy`), and isolated bridge networking (`quickkart-network`).

### Q35: How is QuickKart prepared for AWS Cloud deployment?
**Answer:** QuickKart includes GitHub Actions CI/CD workflows (`.github/workflows/deploy-aws.yml`) and detailed deployment documentation (`docs/development/aws-deployment.md`). The target architecture maps backend microservices to AWS ECS Fargate containers, database to AWS RDS PostgreSQL, caching to AWS ElastiCache Redis, and messaging to AWS MSK (Managed Streaming for Apache Kafka).
