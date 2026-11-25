package com.quickkart.order.dto;

import com.quickkart.order.entity.OrderReturn;

import java.time.LocalDateTime;

public record ReturnResponse(Long id, Long orderId, String reason, String comment, String status, String adminNote,
                             LocalDateTime requestedAt, LocalDateTime resolvedAt, OrderResponse order) {

    public static ReturnResponse from(OrderReturn r, OrderResponse order) {
        return new ReturnResponse(r.getId(), r.getOrder().getId(), r.getReason(), r.getComment(), r.getStatus(),
                r.getAdminNote(), r.getRequestedAt(), r.getResolvedAt(), order);
    }
}
