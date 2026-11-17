package com.quickkart.order.event;

import com.quickkart.order.dto.OrderItemSummary;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record OrderCreatedInternalEvent(
        Long orderId,
        Long userId,
        BigDecimal totalAmount,
        LocalDateTime createdAt,
        List<OrderItemSummary> items
) {
}
