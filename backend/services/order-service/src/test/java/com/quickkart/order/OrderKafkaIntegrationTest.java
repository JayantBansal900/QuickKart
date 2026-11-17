package com.quickkart.order;

import com.quickkart.order.consumer.OrderNotificationConsumer;
import com.quickkart.order.dto.OrderCreatedEvent;
import com.quickkart.order.dto.OrderItemSummary;
import com.quickkart.order.producer.OrderEventProducer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@org.junit.jupiter.api.Tag("infrastructure")
@SpringBootTest(properties = "spring.kafka.consumer.group-id=order-test-group-${random.uuid}")
class OrderKafkaIntegrationTest {

    @Autowired
    private OrderEventProducer orderEventProducer;

    @Autowired
    private OrderNotificationConsumer orderNotificationConsumer;

    @BeforeEach
    void setUp() {
        orderNotificationConsumer.reset();
        orderEventProducer.resetStats();
    }

    @Test
    void testKafkaProducerAndConsumer_WithDuplicateIdempotency() throws Exception {
        String eventId = UUID.randomUUID().toString();
        Long orderId = 888L;
        Long userId = 1L;
        BigDecimal amount = new BigDecimal("199.99");
        List<OrderItemSummary> items = List.of(new OrderItemSummary(10L, "Sample Gadget", 1, amount));

        OrderCreatedEvent firstEvent = new OrderCreatedEvent(
                eventId,
                "ORDER_CREATED",
                orderId,
                userId,
                amount,
                LocalDateTime.now(),
                items
        );

        // 1. Send first event
        orderEventProducer.sendOrderCreatedEvent(firstEvent).get(5, TimeUnit.SECONDS);

        // Wait for consumer with retry loop specifically for this eventId (up to 5 seconds)
        long deadline = System.currentTimeMillis() + 5000;
        while (!orderNotificationConsumer.getProcessedEventIds().contains(eventId) && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
        }

        // Verify consumer processed the event
        assertTrue(orderNotificationConsumer.getProcessedEventIds().contains(eventId), "Processed IDs must record eventId");
        boolean firstWasDuplicate = orderNotificationConsumer.getRecentConsumedEvents().stream()
                .filter(r -> eventId.equals(r.getEventId()))
                .map(r -> r.isDuplicate())
                .findFirst()
                .orElse(true);
        assertFalse(firstWasDuplicate, "First event should not be marked duplicate");

        // 2. Send duplicate event with identical eventId
        OrderCreatedEvent duplicateEvent = new OrderCreatedEvent(
                eventId,
                "ORDER_CREATED",
                orderId,
                userId,
                amount,
                LocalDateTime.now(),
                items
        );

        orderEventProducer.publishDuplicateEvent(duplicateEvent);

        // Wait for consumer duplicate detection (up to 5 seconds)
        deadline = System.currentTimeMillis() + 5000;
        while (orderNotificationConsumer.getRecentConsumedEvents().stream()
                .filter(r -> eventId.equals(r.getEventId()) && r.isDuplicate())
                .findFirst().isEmpty() && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
        }

        // Verify consumer detected duplicate and skipped notification
        boolean duplicateDetected = orderNotificationConsumer.getRecentConsumedEvents().stream()
                .anyMatch(r -> eventId.equals(r.getEventId()) && r.isDuplicate());
        assertTrue(duplicateDetected, "Duplicate count for this eventId must be incremented");
    }
}
