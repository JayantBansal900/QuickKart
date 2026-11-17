package com.quickkart.product.repository;

import com.quickkart.product.entity.StockMovement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {

    Page<StockMovement> findByProductIdOrderByIdDesc(Long productId, Pageable pageable);
}
