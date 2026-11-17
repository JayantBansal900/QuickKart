package com.quickkart.order.exception;

public class CartItemNotFoundException extends ResourceNotFoundException {

    public CartItemNotFoundException(String message) {
        super(message);
    }
}
