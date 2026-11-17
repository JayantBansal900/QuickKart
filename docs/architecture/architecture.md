# QuickKart System Architecture

QuickKart is a high-performance, enterprise-grade e-commerce platform built with a microservice architecture, demonstrating modern distributed systems practices including API Gateway routing, distributed caching, asynchronous event-driven communication, and containerized deployment.

## Architecture Overview

```
                      +-----------------------------+
                      |    React + TypeScript UI    |
                      |      (Vite / Port 3000)     |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      |   Spring Cloud API Gateway  |
                      |         (Port 8080)         |
                      +--------------+--------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+------------------+        +------------------+        +------------------+
| Monolith Service |        | Product Service  |        |  Order Service   |
|   (Port 8081)    |        |   (Port 8082)    |        |   (Port 8083)    |
| Auth & Payments  |        | Product Catalog  |        | Cart & Orders    |
+--------+---------+        +--------+---------+        +--------+---------+
         |                           |                           |
         +---------------------------+---------------------------+
                                     |
                     +---------------+---------------+
                     |                               |
                     v                               v
          +--------------------+           +--------------------+
          | PostgreSQL Database|           |    Redis Cache     |
          |    (Port 5432)     |           |    (Port 6379)     |
          +--------------------+           +--------------------+
                     ^                               ^
                     |       +---------------+       |
                     +-------| Apache Kafka  |-------+
                             |  (Port 9092)  |
                             +---------------+
```

## Core Architecture Principles

### 1. Unified Entry Point via API Gateway
- All external client requests route through the **API Gateway** (`http://localhost:8080`).
- The Gateway provides centralized CORS management, URL rewrites, and request routing across backend services.
- Direct access to individual microservices (`:8081`, `:8082`, `:8083`) remains accessible for isolated development and service-to-service communication.

### 2. Microservices & Domain Separation
- **API Gateway (`services/api-gateway`, Port 8080)**: Central routing layer mapping `/api/auth/**`, `/api/products/**`, `/api/orders/**`, `/api/cart/**`, and `/api/payments/**`.
- **Monolith Service (`services/monolith`, Port 8081)**: Manages User Authentication, JWT issuance, User Profiles, and Payment Processing.
- **Product Service (`services/product-service`, Port 8082)**: Owns product catalog CRUD operations, category management, stock tracking, and public read APIs.
- **Order Service (`services/order-service`, Port 8083)**: Manages persistent shopping carts, cart item updates, order placement, order status transitions, and Kafka order event publishing.

### 3. Distributed Data & Caching Strategy
- **PostgreSQL (`Port 5432`)**: Relational storage for users, products, orders, cart items, and payment transactions.
- **Redis (`Port 6379`)**: High-speed cache used for:
  - Product catalog caching (reducing DB read pressure).
  - High-concurrency inventory locking (preventing overselling during flash sales).
  - JWT token blacklisting on user logout.

### 4. Asynchronous Event-Driven Messaging
- **Apache Kafka (`Port 9092`)**: Decouples order placement from downstream processing.
- When an order is placed in Order Service, a transaction completes and an `OrderCreatedEvent` is published to the `order-events` Kafka topic using Spring `@TransactionalEventListener(phase = AFTER_COMMIT)`.
- Consumers (e.g., Inventory sync, Notification, Analytics) process events asynchronously without blocking the user response path.

## Service Map & Technology Stack

| Service Component | Port | Technology Stack | Core Responsibilities |
|---|---|---|---|
| Frontend UI | 3000 | React 18, TypeScript, Vite, Tailwind CSS | Single Page Application, shopping UI, admin portal, test harnesses |
| API Gateway | 8080 | Java 17, Spring Boot 3.3.4, Spring Cloud Gateway | Path routing, CORS header management, reverse proxy |
| Monolith Service | 8081 | Java 17, Spring Boot, Spring Security, JPA | User Auth (JWT), Payments, legacy endpoints |
| Product Service | 8082 | Java 17, Spring Boot, Spring Data JPA, Redis | Product catalog, admin product management, stock queries |
| Order Service | 8083 | Java 17, Spring Boot, JPA, Redis, Kafka | Cart persistence, order placement, stock locking, event publishing |
| PostgreSQL | 5432 | PostgreSQL 15 | Relational persistence store for all domain entities |
| Redis | 6379 | Redis 7 | Distributed locking, product caching, token blacklist |
| Apache Kafka | 9092 | Apache Kafka 3.7 (KRaft) | Event stream for order processing and integration |
