package com.quickkart.order.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.quickkart.order.entity.Order;

public class OrderResponse {

    private Long id;
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
    private boolean payable;
    public boolean getPayable() {return payable;}
    public OrderResponse() {
    }

    public OrderResponse(
            Long id,
            Long userId,
            String userEmail,
            BigDecimal totalAmount,
            String status,
            LocalDateTime createdAt,
            List<OrderItemResponse> items) {
        this(id, userId, userEmail, totalAmount, status, null, null, createdAt, items);
    }

    public OrderResponse(
            Long id,
            Long userId,
            String userEmail,
            BigDecimal totalAmount,
            String status,
            String paymentMethod,
            String paymentStatus,
            LocalDateTime createdAt,
            List<OrderItemResponse> items) {

        this.id = id;
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
                order.getUser().getId(),
                order.getUser().getEmail(),
                order.getTotalAmount(),
                order.getStatus(),
                paymentMethod,
                paymentStatus,
                order.getCreatedAt(),
                items);
        response.recipientName=order.getRecipientName();response.deliveryAddress=order.getDeliveryAddress();response.deliveryPhone=order.getDeliveryPhone();
        response.cancelledAt=order.getCancelledAt();response.cancelledBy=order.getCancelledBy();
        response.cancellable=order.getCheckoutKey()!=null && java.util.Set.of("PENDING","PLACED","CONFIRMED","PROCESSING").contains(order.getStatus());
        // An online order waits in PENDING until the (simulated) gateway confirms payment; a failed attempt can be retried.
        response.payable="PENDING".equals(order.getStatus()) && !"COD".equals(paymentMethod)
                && ("PENDING".equals(paymentStatus) || "FAILED".equals(paymentStatus));
        return response;
    }

    public Long getId() {
        return id;
    }

    public Long getOrderId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
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