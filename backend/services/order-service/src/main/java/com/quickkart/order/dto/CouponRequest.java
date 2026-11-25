package com.quickkart.order.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CouponRequest(
        @NotBlank @Size(min = 3, max = 40) @Pattern(regexp = "[A-Za-z0-9_-]+", message = "Use letters, numbers, - or _") String code,
        @Size(max = 200) String description,
        @NotBlank @Pattern(regexp = "PERCENT|FLAT") String discountType,
        @NotNull @DecimalMin(value = "0.01") BigDecimal discountValue,
        @DecimalMin(value = "0.01") BigDecimal maxDiscount,
        @DecimalMin(value = "0") BigDecimal minOrderAmount,
        @Min(1) Integer usageLimit,
        Boolean oncePerCustomer,
        LocalDateTime startsAt,
        LocalDateTime expiresAt,
        Boolean active
) {
}
