package com.quickkart.order.controller;

import com.quickkart.order.dto.AddCartItemRequest;
import com.quickkart.order.dto.CartResponse;
import com.quickkart.order.dto.UpdateCartItemRequest;
import com.quickkart.order.service.CartService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public ResponseEntity<CartResponse> getCart(Authentication authentication) {
        CartResponse response = cartService.getCart(authentication.getName());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/items")
    public ResponseEntity<CartResponse> addItem(
            Authentication authentication,
            @Valid @RequestBody AddCartItemRequest request) {
        CartResponse response = cartService.addToCart(authentication.getName(), request);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/items/{productId}")
    public ResponseEntity<CartResponse> updateItemQuantity(
            Authentication authentication,
            @PathVariable Long productId,
            @org.springframework.web.bind.annotation.RequestParam(required = false) Long variantId,
            @Valid @RequestBody UpdateCartItemRequest request) {
        CartResponse response = cartService.updateCartItemQuantity(authentication.getName(), productId, variantId, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/items/{productId}")
    public ResponseEntity<CartResponse> removeItem(
            Authentication authentication,
            @PathVariable Long productId,
            @org.springframework.web.bind.annotation.RequestParam(required = false) Long variantId) {
        CartResponse response = cartService.removeFromCart(authentication.getName(), productId, variantId);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping
    public ResponseEntity<CartResponse> clearCart(Authentication authentication) {
        CartResponse response = cartService.clearCart(authentication.getName());
        return ResponseEntity.ok(response);
    }
}
