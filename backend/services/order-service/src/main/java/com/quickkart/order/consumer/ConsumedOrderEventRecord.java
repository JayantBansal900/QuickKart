package com.quickkart.order.consumer;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class ConsumedOrderEventRecord {

    private String eventId;
    private Long orderId;
    private Long userId;
    private BigDecimal totalAmount;
    private LocalDateTime receivedAt;
    private boolean duplicate;
    private String status;
    private String notificationMessage;

    public ConsumedOrderEventRecord() {
    }

    public ConsumedOrderEventRecord(
            String eventId,
            Long orderId,
            Long userId,
            BigDecimal totalAmount,
            LocalDateTime receivedAt,
            boolean duplicate,
            String status,
            String notificationMessage) {
        this.eventId = eventId;
        this.orderId = orderId;
        this.userId = userId;
        this.totalAmount = totalAmount;
        this.receivedAt = receivedAt;
        this.duplicate = duplicate;
        this.status = status;
        this.notificationMessage = notificationMessage;
    }

    public String getEventId() {
        return eventId;
    }

    public void setEventId(String eventId) {
        this.eventId = eventId;
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

    public LocalDateTime getReceivedAt() {
        return receivedAt;
    }

    public void setReceivedAt(LocalDateTime receivedAt) {
        this.receivedAt = receivedAt;
    }

    public boolean isDuplicate() {
        return duplicate;
    }

    public void setDuplicate(boolean duplicate) {
        this.duplicate = duplicate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getNotificationMessage() {
        return notificationMessage;
    }

    public void setNotificationMessage(String notificationMessage) {
        this.notificationMessage = notificationMessage;
    }
}
