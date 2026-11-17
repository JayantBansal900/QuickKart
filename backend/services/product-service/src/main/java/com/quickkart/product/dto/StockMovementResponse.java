package com.quickkart.product.dto;

import com.quickkart.product.entity.StockMovement;

import java.time.LocalDateTime;

public record StockMovementResponse(Long id, int change, int stockAfter, String reason, String reference,
                                    String actor, LocalDateTime createdAt) {

    public static StockMovementResponse from(StockMovement m) {
        return new StockMovementResponse(m.getId(), m.getChangeQuantity(), m.getStockAfter(), m.getReason(),
                m.getReference(), m.getActor(), m.getCreatedAt());
    }
}
