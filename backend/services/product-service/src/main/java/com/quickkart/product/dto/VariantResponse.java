package com.quickkart.product.dto;

import com.quickkart.product.entity.ProductVariant;

import java.io.Serializable;

public class VariantResponse implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String size;
    private String color;
    private Integer stockQuantity;

    public VariantResponse() {
    }

    public static VariantResponse fromEntity(ProductVariant v) {
        VariantResponse r = new VariantResponse();
        r.id = v.getId();
        r.size = v.getSize();
        r.color = v.getColor();
        r.stockQuantity = v.getStockQuantity();
        return r;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getSize() { return size; }
    public void setSize(String size) { this.size = size; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public Integer getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(Integer stockQuantity) { this.stockQuantity = stockQuantity; }
}
