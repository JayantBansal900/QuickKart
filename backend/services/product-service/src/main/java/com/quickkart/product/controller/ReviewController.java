package com.quickkart.product.controller;

import com.quickkart.product.dto.PageResponse;
import com.quickkart.product.dto.ReviewEligibility;
import com.quickkart.product.dto.ReviewRequest;
import com.quickkart.product.dto.ReviewResponse;
import com.quickkart.product.service.ReviewService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReviewController {

    private final ReviewService reviews;

    public ReviewController(ReviewService reviews) {
        this.reviews = reviews;
    }

    @GetMapping("/api/products/{id}/reviews")
    public PageResponse<ReviewResponse> list(@PathVariable Long id,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "5") int size,
                                             Authentication auth) {
        return reviews.list(id, page, size, signedIn(auth) ? auth.getName() : null);
    }

    @GetMapping("/api/products/{id}/reviews/eligibility")
    public ReviewEligibility eligibility(@PathVariable Long id, Authentication auth) {
        return reviews.eligibility(id, auth.getName());
    }

    /** Creates the caller's review, or updates it if they already wrote one. */
    @PostMapping("/api/products/{id}/reviews")
    public ReviewResponse upsert(@PathVariable Long id, @Valid @RequestBody ReviewRequest request, Authentication auth) {
        return reviews.upsert(id, auth.getName(), request);
    }

    @DeleteMapping("/api/products/{id}/reviews/{reviewId}")
    public ResponseEntity<Void> deleteOwn(@PathVariable Long id, @PathVariable Long reviewId, Authentication auth) {
        reviews.delete(id, reviewId, auth.getName(), false);
        return ResponseEntity.noContent().build();
    }

    /** Moderation. */
    @DeleteMapping("/api/admin/products/{id}/reviews/{reviewId}")
    public ResponseEntity<Void> deleteAsAdmin(@PathVariable Long id, @PathVariable Long reviewId, Authentication auth) {
        reviews.delete(id, reviewId, auth.getName(), true);
        return ResponseEntity.noContent().build();
    }

    private static boolean signedIn(Authentication auth) {
        return auth != null && auth.isAuthenticated() && !(auth instanceof AnonymousAuthenticationToken);
    }
}
