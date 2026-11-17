package com.quickkart.product.repository;

import com.quickkart.product.entity.ProductReview;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProductReviewRepository extends JpaRepository<ProductReview, Long> {

    Page<ProductReview> findByProductIdOrderByCreatedAtDescIdDesc(Long productId, Pageable pageable);

    Optional<ProductReview> findByProductIdAndUserId(Long productId, Long userId);
}
