# QuickKart Observability, Health Monitoring & Distributed Logging

This document details the observability architecture of QuickKart, including health check endpoints, structured application logging, zero-dependency distributed request correlation ID tracking, and CloudWatch metrics integration.

---

## 1. Observability Fundamentals

Observability in distributed systems relies on three core pillars:

```
                      ┌─────────────────────────────────┐
                      │   Observability Architecture    │
                      └────────────────┬────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│   Health Checks  │          │ Structured Logs  │          │   Distributed    │
│ (Actuator / HTTP)│          │ (SLF4J + MDC)    │          │ Correlation IDs  │
└──────────────────┘          └──────────────────┘          └──────────────────┘
```

- **Health Checks**: Instant pass/fail status indicating whether a service and its backing dependencies (DB, Redis, Kafka) are operational.
- **Structured Application Logs**: Detailed textual audit trails emitted by applications during runtime.
- **Distributed Correlation IDs**: A unique identifier (`X-Correlation-ID`) injected at the entry point and passed along every HTTP hop to group disparate service log entries into a single cohesive trace.

---

## 2. Distributed Correlation ID Propagation (`X-Correlation-ID`)

To trace a single user request across API Gateway and downstream microservices without heavy external APM agents:

```
[Client Request]
       │
       ▼ (Path: /api/orders/checkout)
┌─────────────────────────────────────────────────────────┐
│ Spring Cloud API Gateway (:8080)                        │
│ - CorrelationIdFilter generates UUID if missing         │
│ - Injects `X-Correlation-ID: 7a8b9c1d-...`              │
│ - Log: [API Gateway] Routing request... [CorrelationId] │
└────────────────────────────┬────────────────────────────┘
                             │ Forward HTTP Request + Header
                             ▼
┌─────────────────────────────────────────────────────────┐
│ Order Microservice (:8083)                              │
│ - CorrelationIdFilter (OncePerRequestFilter)            │
│ - Sets MDC.put("correlationId", "7a8b9c1d-...")         │
│ - Log: [Order Service] Checkout started... [CorrelationId]│
│ - Clears MDC in finally block                           │
└─────────────────────────────────────────────────────────┘
```

### Log Pattern Configuration
All microservices format console log lines with MDC correlation ID support:
```properties
logging.pattern.console=%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] [%X{correlationId:-N/A}] %-5level %logger{36} - %msg%n
```

### Sample Traced Log Output
```
2026-09-11 04:30:15.102 [reactor-http-epoll-2] [7a8b9c1d-4e2f] INFO  c.q.g.f.CorrelationIdFilter - [API Gateway] Routing request: POST /api/orders/checkout [CorrelationId: 7a8b9c1d-4e2f]
2026-09-11 04:30:15.145 [http-nio-8083-exec-1] [7a8b9c1d-4e2f] INFO  c.q.o.service.OrderService - [Order Service] Starting checkout for user jane@example.com
2026-09-11 04:30:15.180 [http-nio-8083-exec-1] [7a8b9c1d-4e2f] INFO  c.q.o.service.OrderService - [Order Service] Acquired Redis inventory lock for product #1
2026-09-11 04:30:15.210 [http-nio-8083-exec-1] [7a8b9c1d-4e2f] INFO  c.q.o.producer.OrderEventProducer - [Kafka Producer] Published OrderCreatedEvent to quickkart.order-events
```

---

## 3. Spring Boot Actuator Exposure & Security

Actuator endpoints provide operational metrics across the 4 microservices:

| Service | Port | Endpoint URL | Exposed Components | Details Policy |
|---|---|---|---|---|
| **API Gateway** | `8080` | `http://localhost:8080/actuator/health` | Gateway, Ping | Dev: `always` / Prod: `when-authorized` |
| **Monolith** | `8081` | `http://localhost:8081/actuator/health` | DB, Redis, DiskSpace | Dev: `always` / Prod: `when-authorized` |
| **Product Service** | `8082` | `http://localhost:8082/actuator/health` | DB, Redis, DiskSpace | Dev: `always` / Prod: `when-authorized` |
| **Order Service** | `8083` | `http://localhost:8083/actuator/health` | DB, Kafka, DiskSpace | Dev: `always` / Prod: `when-authorized` |

---

## 4. Sensitive Data Masking Policy

To comply with security and privacy standards, QuickKart enforces strict logging boundaries:
- ❌ **NEVER LOG**: User passwords, raw JWT tokens, credit card numbers, database credentials, or secret keys.
- ✅ **ALWAYS LOG**: Action name, User ID / Email, Order ID, Product ID, HTTP status code, and Correlation ID.
