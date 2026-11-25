package com.quickkart.product.dto;

import com.quickkart.product.entity.Product;

import java.io.Serializable;
import java.math.BigDecimal;

public class ProductResponse implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String name;
    private String description;
    private String brand;
    private BigDecimal price;
    private Double discountPercentage;
    private Double rating;
    private Integer reviewCount;
    private Integer stockQuantity;
    private String category;
    private String sku;
    private String imageUrl;
    private String thumbnailUrl;
    private String availability;

    public ProductResponse() {
    }

    public ProductResponse(Long id, String name, String description, BigDecimal price, Integer stockQuantity, String category) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.stockQuantity = stockQuantity;
        this.category = category;
    }

    public ProductResponse(Long id, String name, String description, BigDecimal price, Integer stockQuantity, String category, String imageUrl) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.price = price;
        this.stockQuantity = stockQuantity;
        this.category = category;
        this.imageUrl = imageUrl;
    }

    public static ProductResponse fromEntity(Product product) {
        if (product == null) return null;
        ProductResponse res = new ProductResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getPrice(),
                product.getStockQuantity(),
                product.getCategory(),
                product.getImageUrl()
        );
        res.setBrand(product.getBrand());
        res.setDiscountPercentage(product.getDiscountPercentage());
        res.setRating(product.getRating());
        res.setReviewCount(product.getReviewCount());
        res.setSku(product.getSku());
        res.setThumbnailUrl(product.getThumbnailUrl());
        res.setAvailability(product.getAvailability());
        res.setVariants(product.getVariants().stream().map(VariantResponse::fromEntity).collect(java.util.stream.Collectors.toCollection(java.util.ArrayList::new)));
        return res;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getBrand() {
        return brand;
    }

    public void setBrand(String brand) {
        this.brand = brand;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public Double getDiscountPercentage() {
        return discountPercentage;
    }

    public void setDiscountPercentage(Double discountPercentage) {
        this.discountPercentage = discountPercentage;
    }

    public Double getRating() {
        return rating;
    }

    public void setRating(Double rating) {
        this.rating = rating;
    }

    public Integer getReviewCount() {
        return reviewCount;
    }

    public void setReviewCount(Integer reviewCount) {
        this.reviewCount = reviewCount;
    }

    public Integer getStockQuantity() {
        return stockQuantity;
    }

    public void setStockQuantity(Integer stockQuantity) {
        this.stockQuantity = stockQuantity;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getSku() {
        return sku;
    }

    public void setSku(String sku) {
        this.sku = sku;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public String getThumbnailUrl() {
        return thumbnailUrl;
    }

    public void setThumbnailUrl(String thumbnailUrl) {
        this.thumbnailUrl = thumbnailUrl;
    }

    public String getAvailability() {
        return availability;
    }

    public void setAvailability(String availability) {
        this.availability = availability;
    }

    /** Sizes/colours with their own stock; empty when the product has none. */
    private java.util.List<VariantResponse> variants = new java.util.ArrayList<>();

    public java.util.List<VariantResponse> getVariants() {
        return variants;
    }

    public void setVariants(java.util.List<VariantResponse> variants) {
        this.variants = variants == null ? new java.util.ArrayList<>() : variants;
    }
}
