package com.quickkart.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.quickkart.consumer.ConsumedOrderEventRecord;
import com.quickkart.consumer.OrderNotificationConsumer;
import com.quickkart.dto.OrderCreatedEvent;
import com.quickkart.dto.OrderItemSummary;
import com.quickkart.event.OrderCreatedInternalEvent;
import com.quickkart.event.OrderTransactionEventListener;
import com.quickkart.producer.OrderEventProducer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@org.junit.jupiter.api.Tag("infrastructure")
@SpringBootTest(properties = {"app.kafka.embedded.enabled=false"})
@EmbeddedKafka(
        partitions = 1,
        topics = {"quickkart.order-events"},
        bootstrapServersProperty = "spring.kafka.bootstrap-servers"
)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OrderKafkaIntegrationTest {

    @Autowired
    private OrderEventProducer orderEventProducer;

    @Autowired
    private OrderNotificationConsumer orderNotificationConsumer;

    @Autowired
    private OrderTransactionEventListener orderTransactionEventListener;

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        orderNotificationConsumer.reset();
        orderEventProducer.resetStats();
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
    }

    @Test
    @DisplayName("1. OrderCreatedEvent creation and stable JSON representation")
    void testOrderCreatedEvent_CreationAndJsonSerialization() throws Exception {
        String eventId = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.of(2026, 9, 7, 12, 0, 0);
        List<OrderItemSummary> items = List.of(
                new OrderItemSummary(101L, "Mechanical Keyboard", 1, new BigDecimal("89.99")),
                new OrderItemSummary(102L, "USB-C Cable", 2, new BigDecimal("12.50"))
        );

        OrderCreatedEvent event = new OrderCreatedEvent(
                eventId,
                "ORDER_CREATED",
                555L,
                12L,
                new BigDecimal("114.99"),
                now,
                items
        );

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(event);
        assertNotNull(json);
        assertTrue(json.contains("\"eventId\":\"" + eventId + "\""));
        assertTrue(json.contains("\"eventType\":\"ORDER_CREATED\""));
        assertTrue(json.contains("\"orderId\":555"));
        assertTrue(json.contains("\"userId\":12"));
        assertTrue(json.contains("\"totalAmount\":114.99"));
        assertTrue(json.contains("Mechanical Keyboard"));

        // Deserialize back
        OrderCreatedEvent deserialized = objectMapper.readValue(json, OrderCreatedEvent.class);
        assertEquals(eventId, deserialized.getEventId());
        assertEquals("ORDER_CREATED", deserialized.getEventType());
        assertEquals(555L, deserialized.getOrderId());
        assertEquals(12L, deserialized.getUserId());
        assertEquals(new BigDecimal("114.99"), deserialized.getTotalAmount());
        assertEquals(2, deserialized.getItems().size());
        assertEquals("Mechanical Keyboard", deserialized.getItems().get(0).getProductName());
    }

    @Test
    @DisplayName("2. Producer sends OrderCreatedEvent and Consumer processes mock notification")
    void testProducerSendsEvent_AndConsumerProcessesNotification() throws Exception {
        String eventId = UUID.randomUUID().toString();
        OrderCreatedEvent event = new OrderCreatedEvent(
                eventId,
                "ORDER_CREATED",
                123L,
                5L,
                new BigDecimal("2499.00"),
                LocalDateTime.now(),
                List.of(new OrderItemSummary(1L, "Laptop Pro", 1, new BigDecimal("2499.00")))
        );

        // Publish event to Kafka
        orderEventProducer.sendOrderCreatedEvent(event);

        // Await consumer reception (max 10 seconds)
        boolean received = waitForCondition(() -> orderNotificationConsumer.getTotalConsumedCount() >= 1, 10);
        assertTrue(received, "Consumer should receive the OrderCreatedEvent from topic quickkart.order-events");

        assertEquals(1, orderNotificationConsumer.getTotalConsumedCount());
        assertEquals(1, orderNotificationConsumer.getSimulatedNotificationCount());
        assertEquals(0, orderNotificationConsumer.getDuplicateCount());

        List<ConsumedOrderEventRecord> recent = orderNotificationConsumer.getRecentConsumedEvents();
        assertFalse(recent.isEmpty());
        ConsumedOrderEventRecord record = recent.get(0);
        assertEquals(eventId, record.getEventId());
        assertEquals(123L, record.getOrderId());
        assertEquals(5L, record.getUserId());
        assertEquals(new BigDecimal("2499.00"), record.getTotalAmount());
        assertEquals("PROCESSED", record.getStatus());
        assertNotNull(record.getNotificationMessage());
        assertTrue(record.getNotificationMessage().contains("order #123"));
    }

    @Test
    @DisplayName("3. Duplicate event handling does NOT execute mock notification twice (Idempotency)")
    void testDuplicateEvent_DoesNotTriggerNotificationTwice() throws Exception {
        String sharedEventId = "fixed-duplicate-event-" + UUID.randomUUID();
        OrderCreatedEvent firstEvent = new OrderCreatedEvent(
                sharedEventId,
                "ORDER_CREATED",
                789L,
                8L,
                new BigDecimal("49.99"),
                LocalDateTime.now(),
                List.of(new OrderItemSummary(3L, "Wireless Mouse", 1, new BigDecimal("49.99")))
        );

        // Send first event
        orderEventProducer.sendOrderCreatedEvent(firstEvent);
        boolean firstReceived = waitForCondition(() -> orderNotificationConsumer.getTotalConsumedCount() >= 1, 10);
        assertTrue(firstReceived);
        assertEquals(1, orderNotificationConsumer.getSimulatedNotificationCount());

        // Send exact same event again (duplicate)
        OrderCreatedEvent duplicateEvent = new OrderCreatedEvent(
                sharedEventId,
                "ORDER_CREATED",
                789L,
                8L,
                new BigDecimal("49.99"),
                LocalDateTime.now(),
                List.of(new OrderItemSummary(3L, "Wireless Mouse", 1, new BigDecimal("49.99")))
        );
        orderEventProducer.sendOrderCreatedEvent(duplicateEvent);

        // Wait for consumer to process the duplicate message
        boolean secondReceived = waitForCondition(() -> orderNotificationConsumer.getTotalConsumedCount() >= 2, 10);
        assertTrue(secondReceived);

        // Notification must NOT be simulated again
        assertEquals(1, orderNotificationConsumer.getSimulatedNotificationCount(),
                "Notification must only be simulated once for identical eventId");
        assertEquals(1, orderNotificationConsumer.getDuplicateCount(),
                "Duplicate event count must be exactly 1");

        List<ConsumedOrderEventRecord> events = orderNotificationConsumer.getRecentConsumedEvents();
        assertTrue(events.size() >= 2);
        ConsumedOrderEventRecord duplicateRecord = events.get(0);
        assertTrue(duplicateRecord.isDuplicate());
        assertEquals("SKIPPED_DUPLICATE", duplicateRecord.getStatus());
    }

    @Test
    @DisplayName("4. OrderTransactionEventListener publishes to Kafka upon successful commit")
    void testOrderTransactionEventListener_PublishesToKafka() throws Exception {
        OrderCreatedInternalEvent internalEvent = new OrderCreatedInternalEvent(
                456L,
                99L,
                new BigDecimal("350.00"),
                LocalDateTime.now(),
                List.of(new OrderItemSummary(4L, "Smart Watch", 1, new BigDecimal("350.00")))
        );

        long countBefore = orderNotificationConsumer.getTotalConsumedCount();

        // Trigger listener directly (simulating after commit)
        orderTransactionEventListener.handleOrderCreatedAfterCommit(internalEvent);

        boolean received = waitForCondition(() -> orderNotificationConsumer.getTotalConsumedCount() > countBefore, 10);
        assertTrue(received, "Event triggered after commit should be delivered to Kafka and consumed");
    }

    private boolean waitForCondition(ConditionCheck check, int maxSeconds) throws InterruptedException {
        long end = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(maxSeconds);
        while (System.currentTimeMillis() < end) {
            if (check.isSatisfied()) {
                return true;
            }
            Thread.sleep(100);
        }
        return check.isSatisfied();
    }

    @FunctionalInterface
    interface ConditionCheck {
        boolean isSatisfied();
    }
}
