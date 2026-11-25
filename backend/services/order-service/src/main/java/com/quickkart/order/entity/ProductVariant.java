package com.quickkart.order.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** A size/colour of a product with its own stock (owned by product-service, shared table). */
@Entity
@Table(name = "product_variants")
public class ProductVariant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(nullable = false, length = 20)
    private String size;

    @Column(nullable = false, length = 40)
    private String color = "";

    @Column(length = 80)
    private String sku;

    @Column(name = "stock_quantity", nullable = false)
    private Integer stockQuantity = 0;

    public ProductVariant() {
    }

    public ProductVariant(Product product, String size, String color, Integer stockQuantity) {
        this.product = product;
        this.size = size;
        this.color = color == null ? "" : color;
        this.stockQuantity = stockQuantity;
    }

    public Long getId() { return id; }
    public Product getProduct() { return product; }
    public String getSize() { return size; }
    public String getColor() { return color; }
    public Integer getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(Integer stockQuantity) { this.stockQuantity = stockQuantity; }

    /** "M" or "M / Navy": how the choice is shown on carts, orders and stock history. */
    public String label() {
        return color == null || color.isBlank() ? size : size + " / " + color;
    }
}
