package com.quickkart.order.dto;

import com.quickkart.order.entity.Coupon;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CouponResponse(Long id, String code, String description, String discountType, BigDecimal discountValue,
                             BigDecimal maxDiscount, BigDecimal minOrderAmount, Integer usageLimit, int usedCount,
                             boolean oncePerCustomer, LocalDateTime startsAt, LocalDateTime expiresAt, boolean active) {

    public static CouponResponse from(Coupon c) {
        return new CouponResponse(c.getId(), c.getCode(), c.getDescription(), c.getDiscountType(), c.getDiscountValue(),
                c.getMaxDiscount(), c.getMinOrderAmount(), c.getUsageLimit(), c.getUsedCount(), c.isOncePerCustomer(),
                c.getStartsAt(), c.getExpiresAt(), c.isActive());
    }
}
