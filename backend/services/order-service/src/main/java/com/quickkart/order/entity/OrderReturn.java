package com.quickkart.order.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** A customer's request to return a delivered order (one per order; migration V7). */
@Entity
@Table(name = "order_returns")
public class OrderReturn {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false, unique = true)
    private Order order;

    @Column(nullable = false, length = 40)
    private String reason;

    @Column(length = 1000)
    private String comment;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(name = "admin_note", length = 500)
    private String adminNote;

    @Column(name = "requested_at", nullable = false)
    private LocalDateTime requestedAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    protected OrderReturn() {
    }

    public OrderReturn(Order order, String reason, String comment) {
        this.order = order;
        this.reason = reason;
        this.comment = comment;
        this.status = "REQUESTED";
        this.requestedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Order getOrder() { return order; }
    public String getReason() { return reason; }
    public String getComment() { return comment; }
    public String getStatus() { return status; }
    public String getAdminNote() { return adminNote; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public LocalDateTime getResolvedAt() { return resolvedAt; }

    public void resolve(String status, String adminNote) {
        this.status = status;
        this.adminNote = adminNote;
        this.resolvedAt = LocalDateTime.now();
    }
}
