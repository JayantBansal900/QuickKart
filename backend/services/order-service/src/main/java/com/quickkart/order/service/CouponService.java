package com.quickkart.order.service;

import com.quickkart.order.dto.CouponQuote;
import com.quickkart.order.dto.CouponRequest;
import com.quickkart.order.dto.CouponResponse;
import com.quickkart.order.entity.Coupon;
import com.quickkart.order.repository.CouponRepository;
import com.quickkart.order.repository.OrderRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;

/**
 * Coupons (idea from Saleor/Medusa promotions, own design): percent or flat discounts with an
 * optional cap, minimum order value, total usage limit, one use per customer and a validity window.
 * The checkout re-validates under the coupon's row lock, so the last use can't be taken twice.
 */
@Service
public class CouponService {

    private final CouponRepository coupons;
    private final OrderRepository orders;

    public CouponService(CouponRepository coupons, OrderRepository orders) {
        this.coupons = coupons;
        this.orders = orders;
    }

    /** Preview for the checkout screen; nothing is reserved. */
    @Transactional(readOnly = true)
    public CouponQuote quote(String code, Long userId, BigDecimal subtotal) {
        Coupon coupon = coupons.findByCode(clean(code)).orElseThrow(() -> invalid("This coupon code doesn't exist"));
        BigDecimal discount = discountFor(coupon, userId, subtotal);
        return new CouponQuote(coupon.getCode(), coupon.getDescription(), subtotal, discount, subtotal.subtract(discount));
    }

    /** Used inside the checkout transaction: validates under a row lock and counts the use. */
    @Transactional
    public CouponQuote redeem(String code, Long userId, BigDecimal subtotal) {
        Coupon coupon = coupons.findByCodeForUpdate(clean(code)).orElseThrow(() -> invalid("This coupon code doesn't exist"));
        BigDecimal discount = discountFor(coupon, userId, subtotal);
        coupon.setUsedCount(coupon.getUsedCount() + 1);
        return new CouponQuote(coupon.getCode(), coupon.getDescription(), subtotal, discount, subtotal.subtract(discount));
    }

    /** Gives a use back when an order that used the coupon is cancelled. */
    @Transactional
    public void release(String code) {
        if (code == null) return;
        coupons.findByCodeForUpdate(code).ifPresent(c -> c.setUsedCount(Math.max(0, c.getUsedCount() - 1)));
    }

    /** Offers a shopper can see at checkout (active and currently valid). */
    @Transactional(readOnly = true)
    public List<CouponResponse> activeOffers() {
        LocalDateTime now = LocalDateTime.now();
        return coupons.findActive().stream()
                .filter(c -> (c.getStartsAt() == null || !c.getStartsAt().isAfter(now)) && (c.getExpiresAt() == null || c.getExpiresAt().isAfter(now)))
                .filter(c -> c.getUsageLimit() == null || c.getUsedCount() < c.getUsageLimit())
                .map(CouponResponse::from).toList();
    }

    BigDecimal discountFor(Coupon coupon, Long userId, BigDecimal subtotal) {
        LocalDateTime now = LocalDateTime.now();
        if (!coupon.isActive()) throw invalid("This coupon is no longer active");
        if (coupon.getStartsAt() != null && coupon.getStartsAt().isAfter(now)) throw invalid("This coupon isn't valid yet");
        if (coupon.getExpiresAt() != null && !coupon.getExpiresAt().isAfter(now)) throw invalid("This coupon has expired");
        if (coupon.getUsageLimit() != null && coupon.getUsedCount() >= coupon.getUsageLimit()) throw invalid("This coupon has been fully used");
        if (subtotal.compareTo(coupon.getMinOrderAmount()) < 0)
            throw invalid("Add items worth " + money(coupon.getMinOrderAmount().subtract(subtotal)) + " more to use " + coupon.getCode());
        if (coupon.isOncePerCustomer() && userId != null
                && orders.existsByUserIdAndCouponCodeIgnoreCaseAndStatusNot(userId, coupon.getCode(), "CANCELLED"))
            throw invalid("You've already used " + coupon.getCode());
        BigDecimal discount = "PERCENT".equals(coupon.getDiscountType())
                ? subtotal.multiply(coupon.getDiscountValue()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                : coupon.getDiscountValue();
        if (coupon.getMaxDiscount() != null) discount = discount.min(coupon.getMaxDiscount());
        return discount.min(subtotal).setScale(2, RoundingMode.HALF_UP);
    }

    // ---- admin ----

    @Transactional(readOnly = true)
    public List<CouponResponse> all() {
        return coupons.findAllByOrderByCreatedAtDesc().stream().map(CouponResponse::from).toList();
    }

    @Transactional
    public CouponResponse create(CouponRequest request) {
        String code = clean(request.code());
        if (coupons.findByCode(code).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Coupon " + code + " already exists");
        Coupon coupon = new Coupon();
        coupon.setCode(code);
        apply(coupon, request);
        return CouponResponse.from(coupons.save(coupon));
    }

    @Transactional
    public CouponResponse update(Long id, CouponRequest request) {
        Coupon coupon = coupons.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Coupon not found"));
        String code = clean(request.code());
        coupons.findByCode(code).filter(other -> !other.getId().equals(id)).ifPresent(other -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Coupon " + code + " already exists");
        });
        coupon.setCode(code);
        apply(coupon, request);
        return CouponResponse.from(coupon);
    }

    @Transactional
    public void delete(Long id) {
        Coupon coupon = coupons.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Coupon not found"));
        if (coupon.getUsedCount() > 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This coupon has been used on orders. Switch it off instead of deleting it.");
        coupons.delete(coupon);
    }

    private static void apply(Coupon coupon, CouponRequest r) {
        if ("PERCENT".equals(r.discountType()) && r.discountValue().compareTo(BigDecimal.valueOf(90)) > 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A percentage coupon can be at most 90%");
        if (r.startsAt() != null && r.expiresAt() != null && !r.expiresAt().isAfter(r.startsAt()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The end date must be after the start date");
        coupon.setDescription(r.description() == null || r.description().isBlank() ? null : r.description().trim());
        coupon.setDiscountType(r.discountType());
        coupon.setDiscountValue(r.discountValue());
        coupon.setMaxDiscount("PERCENT".equals(r.discountType()) ? r.maxDiscount() : null);
        coupon.setMinOrderAmount(r.minOrderAmount() == null ? BigDecimal.ZERO : r.minOrderAmount());
        coupon.setUsageLimit(r.usageLimit());
        coupon.setOncePerCustomer(r.oncePerCustomer() == null || r.oncePerCustomer());
        coupon.setStartsAt(r.startsAt());
        coupon.setExpiresAt(r.expiresAt());
        if (r.active() != null) coupon.setActive(r.active());
    }

    static String clean(String code) {
        if (code == null || code.isBlank()) throw invalid("Enter a coupon code");
        return code.trim().toUpperCase(Locale.ROOT);
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static String money(BigDecimal amount) {
        return NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).format(amount);
    }
}
