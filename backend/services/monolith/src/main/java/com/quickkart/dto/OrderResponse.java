package com.quickkart.dto;

import com.quickkart.entity.Order;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

public class OrderResponse {

    private Long orderId;
    private Long userId;
    private String userEmail;
    private BigDecimal totalAmount;
    private String status;
    private String paymentMethod;
    private String paymentStatus;
    private LocalDateTime createdAt;
    private List<OrderItemResponse> items;

    private String recipientName;
    public String getRecipientName() {return recipientName;}
    private String deliveryAddress;
    public String getDeliveryAddress() {return deliveryAddress;}
    private String deliveryPhone;
    public String getDeliveryPhone() {return deliveryPhone;}
    private LocalDateTime cancelledAt;
    public LocalDateTime getCancelledAt() {return cancelledAt;}
    private String cancelledBy;
    public String getCancelledBy() {return cancelledBy;}
    private boolean cancellable;
    public boolean getCancellable() {return cancellable;}
    public OrderResponse() {
    }

    public OrderResponse(Long orderId, BigDecimal totalAmount, String status, LocalDateTime createdAt, List<OrderItemResponse> items) {
        this(orderId, null, null, totalAmount, status, null, null, createdAt, items);
    }

    public OrderResponse(Long orderId, Long userId, String userEmail, BigDecimal totalAmount, String status, String paymentMethod, String paymentStatus, LocalDateTime createdAt, List<OrderItemResponse> items) {
        this.orderId = orderId;
        this.userId = userId;
        this.userEmail = userEmail;
        this.totalAmount = totalAmount;
        this.status = status;
        this.paymentMethod = paymentMethod;
        this.paymentStatus = paymentStatus;
        this.createdAt = createdAt;
        this.items = items;
    }

    public static OrderResponse fromEntity(Order order) {
        return fromEntity(order, null, null);
    }

    public static OrderResponse fromEntity(Order order, String paymentMethod, String paymentStatus) {
        List<OrderItemResponse> items = order.getItems().stream()
                .map(OrderItemResponse::fromEntity)
                .collect(Collectors.toList());

        OrderResponse response = new OrderResponse(
                order.getId(),
                order.getUser() != null ? order.getUser().getId() : null,
                order.getUser() != null ? order.getUser().getEmail() : null,
                order.getTotalAmount(),
                order.getStatus(),
                paymentMethod,
                paymentStatus,
                order.getCreatedAt(),
                items
        );
        response.recipientName = order.getRecipientName();
        response.deliveryAddress = order.getDeliveryAddress();
        response.deliveryPhone = order.getDeliveryPhone();
        response.cancelledAt = order.getCancelledAt();
        response.cancelledBy = order.getCancelledBy();
        response.cancellable = order.getCheckoutKey() != null && List.of("PENDING", "CONFIRMED", "PROCESSING").contains(order.getStatus());
        return response;
    }

    public Long getId() {
        return orderId;
    }

    public void setId(Long id) {
        this.orderId = id;
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

    public String getUserEmail() {
        return userEmail;
    }

    public void setUserEmail(String userEmail) {
        this.userEmail = userEmail;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public void setPaymentMethod(String paymentMethod) {
        this.paymentMethod = paymentMethod;
    }

    public String getPaymentStatus() {
        return paymentStatus;
    }

    public void setPaymentStatus(String paymentStatus) {
        this.paymentStatus = paymentStatus;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public List<OrderItemResponse> getItems() {
        return items;
    }

    public void setItems(List<OrderItemResponse> items) {
        this.items = items;
    }
}
