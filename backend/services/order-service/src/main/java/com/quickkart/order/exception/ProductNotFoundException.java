package com.quickkart.order.exception;

public class ProductNotFoundException extends ResourceNotFoundException {

    public ProductNotFoundException(String message) {
        super(message);
    }

    public ProductNotFoundException(Long id) {
        super("Product not found with ID: " + id);
    }
}
