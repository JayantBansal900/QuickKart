package com.quickkart.order.dto;

import java.math.BigDecimal;

/** What a coupon would do to the current cart: shown at checkout before the order is placed. */
public record CouponQuote(String code, String description, BigDecimal subtotal, BigDecimal discount, BigDecimal total) {
}
