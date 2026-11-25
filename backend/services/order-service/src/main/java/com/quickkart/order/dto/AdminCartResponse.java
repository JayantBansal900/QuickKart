package com.quickkart.order.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** An open (non-empty) cart, for the admin "Carts" page. */
public record AdminCartResponse(Long cartId, Long userId, String customerName, String customerEmail, int itemCount,
                                BigDecimal total, LocalDateTime updatedAt, List<Line> items) {
    public record Line(Long productId, String productName, int quantity, BigDecimal price) {}
}
