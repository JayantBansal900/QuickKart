package com.quickkart.product.dto;

import java.time.LocalDateTime;

/** Public view of a review. Only a short display name is shown, never the email. */
public record ReviewResponse(Long id, Long productId, String authorName, int rating, String title, String comment,
                             boolean verifiedPurchase, boolean mine, LocalDateTime createdAt, LocalDateTime updatedAt) {
}
