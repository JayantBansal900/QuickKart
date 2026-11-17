package com.quickkart.order.repository;

import com.quickkart.order.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long>,
        org.springframework.data.jpa.repository.JpaSpecificationExecutor<Order> {

    /** Online orders still waiting for payment, oldest first (for the expiry job). */
    @org.springframework.data.jpa.repository.Query("select o.id from Order o where o.status = 'PENDING' and o.createdAt < :before order by o.id")
    List<Long> findUnpaidBefore(@org.springframework.data.repository.query.Param("before") java.time.LocalDateTime before);

    Optional<Order> findByUserIdAndCheckoutKey(Long userId,String checkoutKey);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select o from Order o where o.id=:id")
    Optional<Order> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") Long id);
    List<Order> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<Order> findByIdAndUserId(Long id, Long userId);
}
