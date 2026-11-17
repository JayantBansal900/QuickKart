# QuickKart System Sequence Flows

This document details the critical runtime flows in QuickKart, including checkout execution, transactional event publishing with Kafka, distributed inventory locking, and token revocation.

## 1. Checkout & Order Placement Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as React Client
    participant Gateway as API Gateway (:8080)
    participant OrderSvc as Order Service (:8083)
    participant Redis as Redis Cache (:6379)
    participant DB as PostgreSQL (:5432)
    participant Kafka as Apache Kafka (:9092)

    Client->>Gateway: POST /api/orders/checkout (JWT Header)
    Gateway->>OrderSvc: Forward POST /api/orders/checkout
    
    OrderSvc->>OrderSvc: Extract User ID from JWT Token
    OrderSvc->>Redis: Acquire Redis Lock for Cart/Stock (`lock:product:{id}`)
    alt Lock Acquired
        OrderSvc->>DB: Fetch Active Cart & Verify Stock Availability
        alt Stock Sufficient
            OrderSvc->>DB: Create Order (Status: PENDING)
            OrderSvc->>DB: Clear Active User Cart
            OrderSvc->>DB: Commit Transaction
            
            Note over OrderSvc,Kafka: @TransactionalEventListener(phase = AFTER_COMMIT)
            OrderSvc->>Kafka: Publish `OrderCreatedEvent` to `order-events` topic
            
            OrderSvc->>Redis: Release Redis Lock
            OrderSvc-->>Gateway: 201 Created (Order DTO)
            Gateway-->>Client: 201 Created (Order DTO)
        else Insufficient Stock
            OrderSvc->>Redis: Release Redis Lock
            OrderSvc-->>Gateway: 400 Bad Request ("Out of Stock")
            Gateway-->>Client: 400 Bad Request
        end
    else Lock Failed
        OrderSvc-->>Gateway: 409 Conflict ("Resource Busy, retry")
        Gateway-->>Client: 409 Conflict
    end
```

## 2. Kafka Event Publishing (AFTER_COMMIT Guarantee)

To guarantee database consistency and prevent publishing events for rolled-back transactions, QuickKart uses Spring's `TransactionSynchronizationManager` and `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)`.

1. **Transaction Begins**: `OrderService.createOrder()` begins a database transaction.
2. **Order Saved**: Order record is written to PostgreSQL in `PENDING` state.
3. **Event Registered**: `OrderCreatedEvent` is published internally via Spring `ApplicationEventPublisher`.
4. **Transaction Commit**: Spring commits the database transaction.
5. **After Commit Event Fired**: The event listener receives the event ONLY after successful DB commit and sends the payload to Kafka topic `order-events`.
6. **Failure Handling**: If the database transaction fails or rolls back, the Kafka event is **never sent**, eliminating ghost event processing downstream.

## 3. Distributed Inventory Locking with Redis

To avoid race conditions during flash sales:
1. When placing an order, `OrderService` attempts to acquire a short-lived key in Redis (`SET product:lock:{id} {owner} NX PX 3000`).
2. If successful, inventory validation and reservation proceed atomically.
3. If another request holds the lock, the thread waits or returns `409 Conflict`.
4. Once completed, a Lua script verifies ownership before releasing the lock to ensure safety under GC pauses or network delays.

## 4. Authentication & JWT Revocation Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as React Client
    participant Gateway as API Gateway (:8080)
    participant AuthSvc as Monolith Auth (:8081)
    participant Redis as Redis Cache (:6379)

    Client->>Gateway: POST /api/auth/login
    Gateway->>AuthSvc: Forward POST /api/auth/login
    AuthSvc->>AuthSvc: Authenticate Credentials & Generate Signed JWT
    AuthSvc-->>Client: 200 OK { token, role, email }

    Note over Client,Gateway: Subsequent Requests
    Client->>Gateway: GET /api/orders (Authorization: Bearer <token>)
    Gateway->>Redis: Check if Token is Blacklisted (`blacklist:<token>`)
    alt Token Valid
        Gateway-->>OrderSvc: Forward Request with Validated Claims
    else Token Blacklisted
        Gateway-->>Client: 401 Unauthorized ("Token Revoked")
    end

    Note over Client,AuthSvc: User Logout
    Client->>Gateway: POST /api/auth/logout (Authorization: Bearer <token>)
    Gateway->>AuthSvc: Forward Logout
    AuthSvc->>Redis: Save `blacklist:<token>` with TTL = Token Expiry
    AuthSvc-->>Client: 200 OK ("Logged Out Successfully")
```
