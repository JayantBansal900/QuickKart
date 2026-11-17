# Apache Kafka Async Event-Driven Messaging Architecture

QuickKart uses Apache Kafka to support event-driven architecture, decoupling core order placement from downstream processing (such as inventory updates, notifications, and analytics).

## 1. Kafka Cluster & Topic Taxonomy

- **Broker Connection**: `localhost:9092` (Host) / `kafka:29092` (Docker Network)
- **Primary Topic**: `order-events`
- **Partitions**: 3
- **Replication Factor**: 1
- **Key Serialization**: `org.apache.kafka.common.serialization.StringSerializer`
- **Value Serialization**: `org.springframework.kafka.support.serializer.JsonSerializer`

---

## 2. Event Payload Schema

### `OrderCreatedEvent`
Published by **Order Service** whenever a customer successfully completes checkout.

```json
{
  "eventId": "evt-77a829f0-3b91-4c12",
  "eventType": "ORDER_CREATED",
  "orderId": 501,
  "userId": 1,
  "totalAmount": 399.98,
  "status": "PENDING",
  "items": [
    {
      "productId": 1,
      "productName": "Wireless Noise-Canceling Headphones",
      "quantity": 2,
      "price": 199.99
    }
  ],
  "timestamp": "2026-09-11T04:20:00Z"
}
```

---

## 3. Transactional Integrity: `AFTER_COMMIT` Event Listener

To prevent publishing events to Kafka when a database transaction rolls back, QuickKart integrates Spring's `@TransactionalEventListener` with transaction synchronization:

```java
@Transactional
public OrderResponseDTO createOrder(OrderRequestDTO request) {
    Order order = orderRepository.save(newOrder);
    
    // Register event with Spring's ApplicationEventPublisher
    eventPublisher.publishEvent(new OrderCreatedEvent(order));
    
    return mapToDTO(order);
}

// Event Listener configured for AFTER_COMMIT phase
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void handleOrderCreatedEvent(OrderCreatedEvent event) {
    kafkaTemplate.send("order-events", String.valueOf(event.getOrderId()), event);
}
```

### Guarantees
- **No Ghost Events**: If `orderRepository.save()` fails or database constraints are violated, the Kafka event is **never emitted**.
- **At-Least-Once Delivery**: Events are published with Kafka producer ACKs enabled (`acks=all`), ensuring persistent message capture.

---

## 4. Consumer Group Architecture

Downstream processors subscribe to `order-events` via consumer groups:
- **`inventory-service-group`**: Updates product inventory stock across warehouses.
- **`notification-service-group`**: Triggers email/SMS order confirmation receipts.
- **`analytics-service-group`**: Ingests order metrics into reporting data lakes.
