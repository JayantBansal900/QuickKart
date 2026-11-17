package com.quickkart.order.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.order.dto.OrderCreatedEvent;
import com.quickkart.order.event.OrderCreatedInternalEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Turns the in-process "order created" event into an outbox row.
 *
 * BEFORE_COMMIT runs inside the checkout transaction: if writing the outbox row fails, the whole
 * order rolls back; if the order rolls back, the outbox row disappears with it. Publishing to
 * Kafka is left to OutboxRelay, so a Kafka outage can no longer lose an order event.
 * (Previously the event was sent AFTER_COMMIT and was simply lost if Kafka was down.)
 */
@Component
public class OrderOutboxWriter {

    private final OutboxEventRepository outbox;
    private final ObjectMapper objectMapper;
    private final String topic;

    public OrderOutboxWriter(OutboxEventRepository outbox, ObjectMapper objectMapper,
                             @Value("${app.kafka.topics.order-events:quickkart.order-events}") String topic) {
        this.outbox = outbox;
        this.objectMapper = objectMapper;
        this.topic = topic;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void writeOrderCreated(OrderCreatedInternalEvent internal) {
        // Deterministic id: one order -> one event id, so retries can be de-duplicated downstream.
        String eventId = "ORDER_CREATED-" + internal.orderId();
        OrderCreatedEvent event = new OrderCreatedEvent(eventId, "ORDER_CREATED", internal.orderId(), internal.userId(),
                internal.totalAmount(), internal.createdAt(), internal.items());
        try {
            outbox.save(new OutboxEvent(eventId, topic, String.valueOf(internal.orderId()), objectMapper.writeValueAsString(event)));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialise order event " + eventId, ex);
        }
    }
}
