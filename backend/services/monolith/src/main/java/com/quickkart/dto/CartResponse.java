package com.quickkart.dto;

import com.quickkart.entity.Cart;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

public class CartResponse {

    private Long cartId;
    private String fingerprint;
    public String getFingerprint() {return fingerprint;}
    public void setFingerprint(String value) {fingerprint=value;}
    private List<CartItemResponse> items;
    private BigDecimal totalAmount;

    public CartResponse() {
    }

    public CartResponse(Long cartId, List<CartItemResponse> items, BigDecimal totalAmount) {
        this.cartId = cartId;
        this.items = items;
        this.totalAmount = totalAmount;
    }

    public static CartResponse fromEntity(Cart cart) {
        List<CartItemResponse> items = cart.getItems().stream()
                .map(CartItemResponse::fromEntity)
                .collect(Collectors.toList());

        BigDecimal totalAmount = items.stream()
                .map(CartItemResponse::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new CartResponse(cart.getId(), items, totalAmount);
    }

    public Long getCartId() {
        return cartId;
    }

    public void setCartId(Long cartId) {
        this.cartId = cartId;
    }

    public List<CartItemResponse> getItems() {
        return items;
    }

    public void setItems(List<CartItemResponse> items) {
        this.items = items;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }
}
