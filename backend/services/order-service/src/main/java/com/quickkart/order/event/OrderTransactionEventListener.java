package com.quickkart.order.event;

import com.quickkart.order.dto.OrderCreatedEvent;
import com.quickkart.order.producer.OrderEventProducer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

/**
 * Listens for internal order creation events and publishes them to Kafka
 * ONLY AFTER the database transaction has committed successfully.
 *
 * If the database transaction rolls back (e.g. insufficient inventory, empty cart,
 * database constraint violation), this listener is NEVER executed.
 */
@Component
public class OrderTransactionEventListener {

    private static final Logger log = LoggerFactory.getLogger(OrderTransactionEventListener.class);

    private final OrderEventProducer orderEventProducer;

    public OrderTransactionEventListener(OrderEventProducer orderEventProducer) {
        this.orderEventProducer = orderEventProducer;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOrderCreatedAfterCommit(OrderCreatedInternalEvent internalEvent) {
        log.info("[Transaction Listener] DB Transaction committed successfully for orderId: {}. Preparing Kafka OrderCreatedEvent...",
                internalEvent.orderId());

        OrderCreatedEvent kafkaEvent = new OrderCreatedEvent(
                "ORDER_CREATED-" + internalEvent.orderId(),
                "ORDER_CREATED",
                internalEvent.orderId(),
                internalEvent.userId(),
                internalEvent.totalAmount(),
                internalEvent.createdAt(),
                internalEvent.items()
        );

        try { orderEventProducer.sendOrderCreatedEvent(kafkaEvent); }
        catch (RuntimeException ex) { log.error("Order {} committed; notification publication failed and requires operational replay", internalEvent.orderId(), ex); }
    }
}
