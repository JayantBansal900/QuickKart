package com.quickkart.order.producer;

import com.quickkart.order.dto.OrderCreatedEvent;
import com.quickkart.order.dto.OrderItemSummary;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class OrderEventProducer {

    private static final Logger log = LoggerFactory.getLogger(OrderEventProducer.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final String orderEventsTopic;

    private final AtomicLong totalPublishedCount = new AtomicLong(0);
    private final List<OrderCreatedEvent> recentPublishedEvents = new CopyOnWriteArrayList<>();

    public OrderEventProducer(
            KafkaTemplate<String, Object> kafkaTemplate,
            @Value("${app.kafka.topics.order-events:quickkart.order-events}") String orderEventsTopic) {
        this.kafkaTemplate = kafkaTemplate;
        this.orderEventsTopic = orderEventsTopic;
    }

    /**
     * Publishes an OrderCreatedEvent to the Kafka topic.
     * Uses the orderId as the message key to preserve partition ordering for the same order.
     */
    public CompletableFuture<SendResult<String, Object>> sendOrderCreatedEvent(OrderCreatedEvent event) {
        String key = event.getOrderId() != null ? String.valueOf(event.getOrderId()) : event.getEventId();
        log.info("[Kafka Producer] Publishing OrderCreatedEvent (eventId: {}, orderId: {}, key: {}) to topic: {}",
                event.getEventId(), event.getOrderId(), key, orderEventsTopic);

        // Record locally for developer sandbox observability
        recordPublishedEvent(event);

        CompletableFuture<SendResult<String, Object>> future = kafkaTemplate.send(orderEventsTopic, key, event);

        future.whenComplete((result, ex) -> {
            if (ex == null) {
                totalPublishedCount.incrementAndGet();
                log.info("[Kafka Producer] Successfully delivered eventId: {} to topic: {} [partition: {}, offset: {}]",
                        event.getEventId(),
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            } else {
                log.error("[Kafka Producer] Failed to deliver eventId: {} to topic: {}. Reason: {}",
                        event.getEventId(), orderEventsTopic, ex.getMessage(), ex);
            }
        });

        return future;
    }

    /**
     * Helper to publish a test order event for the REST API Sandbox UI.
     */
    public OrderCreatedEvent publishTestOrderEvent(Long orderId, Long userId, BigDecimal totalAmount) {
        List<OrderItemSummary> sampleItems = new ArrayList<>();
        sampleItems.add(new OrderItemSummary(1L, "Sample Product", 1, totalAmount));

        OrderCreatedEvent event = new OrderCreatedEvent(
                UUID.randomUUID().toString(),
                "ORDER_CREATED",
                orderId != null ? orderId : System.currentTimeMillis() % 100000,
                userId != null ? userId : 1L,
                totalAmount != null ? totalAmount : new BigDecimal("99.99"),
                LocalDateTime.now(),
                sampleItems
        );

        sendOrderCreatedEvent(event);
        return event;
    }

    /**
     * Helper to re-publish an existing event or custom event for duplicate idempotency testing.
     */
    public OrderCreatedEvent publishDuplicateEvent(OrderCreatedEvent event) {
        sendOrderCreatedEvent(event);
        return event;
    }

    private void recordPublishedEvent(OrderCreatedEvent event) {
        recentPublishedEvents.add(0, event);
        while (recentPublishedEvents.size() > 50) {
            recentPublishedEvents.remove(recentPublishedEvents.size() - 1);
        }
    }

    public long getTotalPublishedCount() {
        return totalPublishedCount.get();
    }

    public List<OrderCreatedEvent> getRecentPublishedEvents() {
        return Collections.unmodifiableList(recentPublishedEvents);
    }

    public String getTopicName() {
        return orderEventsTopic;
    }

    public void resetStats() {
        totalPublishedCount.set(0);
        recentPublishedEvents.clear();
    }
}
