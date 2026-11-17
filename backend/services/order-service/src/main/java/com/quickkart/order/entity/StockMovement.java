package com.quickkart.order.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** Append-only audit row for every stock change (table owned by migration V6). */
@Entity
@Table(name = "stock_movements")
public class StockMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "change_quantity", nullable = false)
    private int changeQuantity;

    @Column(name = "stock_after", nullable = false)
    private int stockAfter;

    @Column(nullable = false, length = 40)
    private String reason;

    @Column(length = 120)
    private String reference;

    @Column(length = 255)
    private String actor;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    protected StockMovement() {
    }

    public StockMovement(Long productId, int changeQuantity, int stockAfter, String reason, String reference, String actor) {
        this.productId = productId;
        this.changeQuantity = changeQuantity;
        this.stockAfter = stockAfter;
        this.reason = reason;
        this.reference = reference;
        this.actor = actor;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getProductId() { return productId; }
    public int getChangeQuantity() { return changeQuantity; }
    public int getStockAfter() { return stockAfter; }
    public String getReason() { return reason; }
    public String getReference() { return reference; }
    public String getActor() { return actor; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
