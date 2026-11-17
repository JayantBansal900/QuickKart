package com.quickkart.repository;

import com.quickkart.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    Optional<Order> findByUserIdAndCheckoutKey(Long userId,String checkoutKey);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select o from Order o where o.id=:id")
    Optional<Order> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
    List<Order> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<Order> findByIdAndUserId(Long id, Long userId);

    @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(o.totalAmount), 0) FROM Order o WHERE o.status != 'CANCELLED'")
    java.math.BigDecimal calculateTotalRevenue();

    long countByStatus(String status);

    long countByStatusIn(java.util.Collection<String> statuses);

    /** Money actually received: COD payments are marked COLLECTED when the order is delivered. */
    @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(p.amount), 0) FROM Payment p WHERE p.status = 'COLLECTED'")
    java.math.BigDecimal calculateCollectedRevenue();
}
