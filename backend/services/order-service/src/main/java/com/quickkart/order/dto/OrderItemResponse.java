package com.quickkart.order.dto;

import com.quickkart.order.entity.OrderItem;

import java.math.BigDecimal;

public class OrderItemResponse {

    private Long productId;
    private String productName;
    private Integer quantity;
    private BigDecimal price;
    private BigDecimal subtotal;
    private String size;
    private String color;

    public OrderItemResponse() {
    }

    public OrderItemResponse(Long productId, String productName, Integer quantity, BigDecimal price, BigDecimal subtotal) {
        this.productId = productId;
        this.productName = productName;
        this.quantity = quantity;
        this.price = price;
        this.subtotal = subtotal;
    }

    public static OrderItemResponse fromEntity(OrderItem orderItem) {
        BigDecimal subtotal = orderItem.getPrice().multiply(BigDecimal.valueOf(orderItem.getQuantity()));
        OrderItemResponse response = new OrderItemResponse(
                orderItem.getProduct().getId(),
                orderItem.getProductName() != null ? orderItem.getProductName() : "Product #" + orderItem.getProduct().getId() + " (historical title unavailable)",
                orderItem.getQuantity(),
                orderItem.getPrice(),
                subtotal
        );
        response.size = orderItem.getSize();
        response.color = orderItem.getColor();
        return response;
    }

    public String getSize() { return size; }
    public String getColor() { return color; }

    public Long getProductId() {
        return productId;
    }

    public void setProductId(Long productId) {
        this.productId = productId;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = productName;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public void setSubtotal(BigDecimal subtotal) {
        this.subtotal = subtotal;
    }
}
