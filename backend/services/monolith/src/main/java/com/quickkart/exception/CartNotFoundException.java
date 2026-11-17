package com.quickkart.exception;

public class CartNotFoundException extends ResourceNotFoundException {
    public CartNotFoundException(String message) {
        super(message);
    }
}
