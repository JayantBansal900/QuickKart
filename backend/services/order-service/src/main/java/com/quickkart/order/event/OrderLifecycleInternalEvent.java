package com.quickkart.order.event;

import java.math.BigDecimal;

/**
 * In-process notice that an order changed state after checkout (status change, payment result).
 * OrderOutboxWriter turns it into an outbox row inside the same transaction.
 *
 * @param eventId   deterministic where possible, so a retried write can't create two events
 * @param eventType ORDER_STATUS_CHANGED, PAYMENT_SUCCEEDED or PAYMENT_FAILED
 */
public record OrderLifecycleInternalEvent(
        String eventId,
        String eventType,
        Long orderId,
        Long userId,
        BigDecimal totalAmount,
        String status,
        String paymentMethod,
        String paymentStatus
) {
}
