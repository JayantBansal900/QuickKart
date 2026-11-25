package com.quickkart.order.repository;

import com.quickkart.order.entity.OrderReturn;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface OrderReturnRepository extends JpaRepository<OrderReturn, Long> {

    Optional<OrderReturn> findByOrderId(Long orderId);

    Page<OrderReturn> findByStatusOrderByRequestedAtDesc(String status, Pageable pageable);

    Page<OrderReturn> findAllByOrderByRequestedAtDesc(Pageable pageable);
}
