package com.quickkart.order.repository;

import com.quickkart.order.entity.Coupon;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CouponRepository extends JpaRepository<Coupon, Long> {

    @Query("select c from Coupon c where upper(c.code) = upper(:code)")
    Optional<Coupon> findByCode(@Param("code") String code);

    /** Locks the coupon row so two checkouts can't both take the last use. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Coupon c where upper(c.code) = upper(:code)")
    Optional<Coupon> findByCodeForUpdate(@Param("code") String code);

    List<Coupon> findAllByOrderByCreatedAtDesc();

    @Query("select c from Coupon c where c.active = true order by c.minOrderAmount asc, c.id asc")
    List<Coupon> findActive();
}
