package com.quickkart.product.exception;

/** Thrown when a product cannot be deleted because orders or carts still reference it (HTTP 409). */
public class ProductInUseException extends RuntimeException {
    public ProductInUseException(Long id) {
        super("Product " + id + " is referenced by existing orders or carts and cannot be deleted. "
                + "Set its availability to DISCONTINUED to hide it from the store instead.");
    }
}
