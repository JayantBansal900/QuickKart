package com.quickkart.product.service;

import com.quickkart.product.dto.PageResponse;
import com.quickkart.product.dto.ReviewEligibility;
import com.quickkart.product.dto.ReviewRequest;
import com.quickkart.product.dto.ReviewResponse;
import com.quickkart.product.entity.Product;
import com.quickkart.product.entity.ProductReview;
import com.quickkart.product.exception.ProductNotFoundException;
import com.quickkart.product.repository.ProductRepository;
import com.quickkart.product.repository.ProductReviewRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Customer reviews. Only a customer with a DELIVERED order containing the product can review it
 * ("verified purchase"), once per product; writing again edits the existing review.
 *
 * The product's rating/review_count started from catalog data, so they are kept as a running
 * average: each new, edited or deleted review adjusts them under the product's row lock.
 */
@Service
public class ReviewService {

    private static final int MAX_PAGE_SIZE = 20;

    private final ProductReviewRepository reviews;
    private final ProductRepository products;
    private final JdbcTemplate jdbc;

    public ReviewService(ProductReviewRepository reviews, ProductRepository products, JdbcTemplate jdbc) {
        this.reviews = reviews;
        this.products = products;
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public PageResponse<ReviewResponse> list(Long productId, int page, int size, String viewerEmail) {
        if (!products.existsById(productId)) throw new ProductNotFoundException(productId);
        // Public list: an unknown or deleted account just reads it as a guest instead of getting 401.
        Long viewerId = viewerEmail == null ? null : jdbc.queryForList("select id from users where email = ?", Long.class, viewerEmail)
                .stream().findFirst().orElse(null);
        var result = reviews.findByProductIdOrderByCreatedAtDescIdDesc(productId,
                PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE)));
        Map<Long, String> names = new HashMap<>();
        return PageResponse.from(result, r -> toResponse(r, names.computeIfAbsent(r.getUserId(), this::displayName), viewerId));
    }

    @Transactional(readOnly = true)
    public ReviewEligibility eligibility(Long productId, String email) {
        if (!products.existsById(productId)) throw new ProductNotFoundException(productId);
        Account me = account(email);
        ReviewResponse mine = reviews.findByProductIdAndUserId(productId, me.id())
                .map(r -> toResponse(r, displayName(me.name()), me.id())).orElse(null);
        if (!"USER".equals(me.role())) return new ReviewEligibility(false, "Only customers can write reviews.", mine);
        if (!hasReceived(me.id(), productId))
            return new ReviewEligibility(false, "You can review this product after it has been delivered to you.", mine);
        return new ReviewEligibility(true, null, mine);
    }

    @Transactional
    @CacheEvict(cacheNames = ProductService.SEARCH_CACHE, allEntries = true)
    public ReviewResponse upsert(Long productId, String email, ReviewRequest request) {
        Account me = account(email);
        if (!"USER".equals(me.role())) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only customers can write reviews");
        Product product = products.findByIdForUpdate(productId).orElseThrow(() -> new ProductNotFoundException(productId));
        if (!hasReceived(me.id(), productId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can review this product after it has been delivered to you");

        ProductReview review = reviews.findByProductIdAndUserId(productId, me.id()).orElse(null);
        int rating = request.rating();
        if (review == null) {
            review = new ProductReview(productId, me.id());
            adjustRating(product, 0, rating, +1);
        } else {
            adjustRating(product, review.getRating(), rating, 0);
            review.touch();
        }
        review.setRating(rating);
        review.setTitle(blankToNull(request.title()));
        review.setComment(blankToNull(request.comment()));
        return toResponse(reviews.save(review), displayName(me.name()), me.id());
    }

    /** A customer deletes their own review, or an admin removes any review (moderation). */
    @Transactional
    @CacheEvict(cacheNames = ProductService.SEARCH_CACHE, allEntries = true)
    public void delete(Long productId, Long reviewId, String email, boolean admin) {
        ProductReview review = reviews.findById(reviewId)
                .filter(r -> r.getProductId().equals(productId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Review not found"));
        if (!admin && !review.getUserId().equals(account(email).id()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Review not found");
        Product product = products.findByIdForUpdate(productId).orElseThrow(() -> new ProductNotFoundException(productId));
        adjustRating(product, review.getRating(), 0, -1);
        reviews.delete(review);
    }

    /** Running average: remove {@code oldRating} (if any) and add {@code newRating} (if any). */
    static void adjustRating(Product product, int oldRating, int newRating, int countDelta) {
        int count = product.getReviewCount() == null ? 0 : product.getReviewCount();
        double avg = product.getRating() == null ? 0 : product.getRating();
        double total = avg * count - oldRating + newRating;
        int newCount = Math.max(0, count + countDelta);
        double newAvg = newCount == 0 ? 0 : Math.min(5, Math.max(1, total / newCount));
        product.setReviewCount(newCount);
        product.setRating(newCount == 0 ? null : BigDecimal.valueOf(newAvg).setScale(2, RoundingMode.HALF_UP).doubleValue());
    }

    private boolean hasReceived(Long userId, Long productId) {
        Integer n = jdbc.queryForObject("select count(*) from order_items oi join orders o on o.id = oi.order_id "
                + "where o.user_id = ? and oi.product_id = ? and o.status = 'DELIVERED'", Integer.class, userId, productId);
        return n != null && n > 0;
    }

    private record Account(Long id, String name, String role) {}

    private Account account(String email) {
        List<Account> found = jdbc.query("select id, name, role from users where email = ?",
                (rs, i) -> new Account(rs.getLong("id"), rs.getString("name"), rs.getString("role")), email);
        if (found.isEmpty()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Account not found");
        return found.get(0);
    }

    private String displayName(Long userId) {
        List<String> names = jdbc.queryForList("select name from users where id = ?", String.class, userId);
        return displayName(names.isEmpty() ? null : names.get(0));
    }

    /** "Priya Sharma" -> "Priya S." — enough to feel human without exposing full identities. */
    static String displayName(String name) {
        if (name == null || name.isBlank()) return "QuickKart customer";
        String[] parts = name.trim().split("\\s+");
        return parts.length == 1 ? parts[0] : parts[0] + " " + Character.toUpperCase(parts[parts.length - 1].charAt(0)) + ".";
    }

    private static ReviewResponse toResponse(ProductReview r, String author, Long viewerId) {
        return new ReviewResponse(r.getId(), r.getProductId(), author, r.getRating(), r.getTitle(), r.getComment(),
                true, viewerId != null && viewerId.equals(r.getUserId()), r.getCreatedAt(), r.getUpdatedAt());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
