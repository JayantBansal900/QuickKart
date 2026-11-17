package com.quickkart.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders", uniqueConstraints = @jakarta.persistence.UniqueConstraint(name="uk_orders_user_checkout", columnNames={"user_id","checkout_key"}))
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private String status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    @Column(name="checkout_key", length=80)
    private String checkoutKey;
    public String getCheckoutKey() { return checkoutKey; }
    public void setCheckoutKey(String value) { this.checkoutKey=value; }

    @Column(length=64)
    private String requestFingerprint;
    public String getRequestFingerprint() { return requestFingerprint; }
    public void setRequestFingerprint(String value) { this.requestFingerprint=value; }

    @Column(length=120)
    private String recipientName;
    public String getRecipientName() { return recipientName; }
    public void setRecipientName(String value) { this.recipientName=value; }

    @Column(length=1000)
    private String deliveryAddress;
    public String getDeliveryAddress() { return deliveryAddress; }
    public void setDeliveryAddress(String value) { this.deliveryAddress=value; }

    @Column(length=40)
    private String deliveryPhone;
    public String getDeliveryPhone() { return deliveryPhone; }
    public void setDeliveryPhone(String value) { this.deliveryPhone=value; }

    @Column
    private LocalDateTime cancelledAt;
    public LocalDateTime getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(LocalDateTime value) { this.cancelledAt=value; }

    @Column(length=255)
    private String cancelledBy;
    public String getCancelledBy() { return cancelledBy; }
    public void setCancelledBy(String value) { this.cancelledBy=value; }

    public Order() {
    }

    public Order(User user, BigDecimal totalAmount, String status, LocalDateTime createdAt) {
        this.user = user;
        this.totalAmount = totalAmount;
        this.status = status;
        this.createdAt = createdAt;
    }

    public Order(Long id, User user, BigDecimal totalAmount, String status, LocalDateTime createdAt) {
        this.id = id;
        this.user = user;
        this.totalAmount = totalAmount;
        this.status = status;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
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

    public List<OrderItem> getItems() {
        return items;
    }

    public void setItems(List<OrderItem> items) {
        this.items = items;
    }

    public void addItem(OrderItem item) {
        items.add(item);
        item.setOrder(this);
    }
}
