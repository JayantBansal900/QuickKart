package com.quickkart.product.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** One purchasable size/colour of a product, with its own stock. */
@Entity
@Table(name = "product_variants", uniqueConstraints =
        @UniqueConstraint(name = "uk_product_variants_product_size_color", columnNames = {"product_id", "size", "color"}))
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
    public String getSku() { return sku; }
    public void setSku(String sku) { this.sku = sku; }
    public Integer getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(Integer stockQuantity) { this.stockQuantity = stockQuantity; }
}
