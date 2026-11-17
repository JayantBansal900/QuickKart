package com.quickkart.product.dto;

/** Whether the signed-in customer may review a product, and their existing review if any. */
public record ReviewEligibility(boolean canReview, String reason, ReviewResponse myReview) {
}
