package com.quickkart.order.dto;

import com.quickkart.order.entity.CartItem;

import java.math.BigDecimal;

public class CartItemResponse {

    private Long productId;
    private Integer availableQuantity;
    public Integer getAvailableQuantity() {return availableQuantity;}
    private String productName;
    private BigDecimal price;
    private Integer quantity;
    private BigDecimal subtotal;
    /** Product picture for the cart UI (display only; not part of the checkout fingerprint). */
    private String imageUrl;
    /** Chosen size/colour (null when the product has none). */
    private Long variantId;
    private String size;
    private String color;

    public CartItemResponse() {
    }

    public CartItemResponse(Long productId, String productName, BigDecimal price, Integer quantity, BigDecimal subtotal) {
        this.productId = productId;
        this.productName = productName;
        this.price = price;
        this.quantity = quantity;
        this.subtotal = subtotal;
    }

    public static CartItemResponse fromEntity(CartItem cartItem) {
        BigDecimal price = cartItem.getProduct().getPrice();
        BigDecimal subtotal = price.multiply(BigDecimal.valueOf(cartItem.getQuantity()));
        CartItemResponse response = new CartItemResponse(
                cartItem.getProduct().getId(),
                cartItem.getProduct().getName(),
                price,
                cartItem.getQuantity(),
                subtotal
        );
        var variant=cartItem.getVariant();
        response.availableQuantity=variant==null ? cartItem.getProduct().getStockQuantity() : variant.getStockQuantity();
        if(variant!=null) {
            response.variantId=variant.getId();
            response.size=variant.getSize();
            response.color=variant.getColor().isBlank() ? null : variant.getColor();
        }
        response.imageUrl=cartItem.getProduct().getImageUrl();
        return response;
    }

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

    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public Integer getQuantity() {
        return quantity;
    }

    public void setQuantity(Integer quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public void setSubtotal(BigDecimal subtotal) {
        this.subtotal = subtotal;
    }

    public Long getVariantId() { return variantId; }
    public String getSize() { return size; }
    public String getColor() { return color; }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }
}
