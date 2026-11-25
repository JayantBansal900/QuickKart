package com.quickkart.order.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class OrderCreatedEvent {

    private String eventId;
    private String eventType = "ORDER_CREATED";
    private Long orderId;
    private Long userId;
    private BigDecimal totalAmount;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime createdAt;

    private List<OrderItemSummary> items = new ArrayList<>();

    /** Set on every event since payments/status events were added; null on older ORDER_CREATED events (= COD). */
    private String status;
    private String paymentMethod;
    private String paymentStatus;
    /** Dispatch details, set on ORDER_STATUS_CHANGED events once the order has shipped. */
    private String courier;
    private String trackingNumber;

    public String getCourier() { return courier; }
    public void setCourier(String courier) { this.courier = courier; }
    public String getTrackingNumber() { return trackingNumber; }
    public void setTrackingNumber(String trackingNumber) { this.trackingNumber = trackingNumber; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPaymentMethod() { return paymentMethod; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
    public String getPaymentStatus() { return paymentStatus; }
    public void setPaymentStatus(String paymentStatus) { this.paymentStatus = paymentStatus; }

    public OrderCreatedEvent() {
    }

    public OrderCreatedEvent(
            String eventId,
            String eventType,
            Long orderId,
            Long userId,
            BigDecimal totalAmount,
            LocalDateTime createdAt,
            List<OrderItemSummary> items) {
        this.eventId = eventId != null ? eventId : UUID.randomUUID().toString();
        this.eventType = eventType != null ? eventType : "ORDER_CREATED";
        this.orderId = orderId;
        this.userId = userId;
        this.totalAmount = totalAmount;
        this.createdAt = createdAt != null ? createdAt : LocalDateTime.now();
        if (items != null) {
            this.items = items;
        }
    }

    public static OrderCreatedEvent create(
            Long orderId,
            Long userId,
            BigDecimal totalAmount,
            LocalDateTime createdAt,
            List<OrderItemSummary> items) {
        return new OrderCreatedEvent(
                UUID.randomUUID().toString(),
                "ORDER_CREATED",
                orderId,
                userId,
                totalAmount,
                createdAt,
                items
        );
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public Long getOrderId() {
        return orderId;
    }

    public void setOrderId(Long orderId) {
        this.orderId = orderId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public List<OrderItemSummary> getItems() {
        return items;
    }

    public void setItems(List<OrderItemSummary> items) {
        this.items = items;
    }

    @Override
    public String toString() {
        return "OrderCreatedEvent{" +
                "eventId='" + eventId + '\'' +
                ", eventType='" + eventType + '\'' +
                ", orderId=" + orderId +
                ", userId=" + userId +
                ", totalAmount=" + totalAmount +
                ", createdAt=" + createdAt +
                ", itemsCount=" + (items != null ? items.size() : 0) +
                '}';
    }
}
