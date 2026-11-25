package com.quickkart.product.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** One size/colour row in a product edit. Rows are matched by (size, colour). */
public class VariantRequest {

    @NotBlank(message = "Size is required")
    @Size(max = 20, message = "Size is too long")
    private String size;

    @Size(max = 40, message = "Colour is too long")
    private String color;

    @NotNull(message = "Stock is required")
    @Min(value = 0, message = "Stock must not be negative")
    @Max(value = 100000, message = "Stock is too large")
    private Integer stockQuantity;

    public VariantRequest() {
    }

    public VariantRequest(String size, String color, Integer stockQuantity) {
        this.size = size;
        this.color = color;
        this.stockQuantity = stockQuantity;
    }

    public String getSize() { return size; }
    public void setSize(String size) { this.size = size; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public Integer getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(Integer stockQuantity) { this.stockQuantity = stockQuantity; }
}
