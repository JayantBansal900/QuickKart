package com.quickkart.order.controller;

import com.quickkart.order.dto.AdminCartResponse;
import com.quickkart.order.dto.CouponQuote;
import com.quickkart.order.dto.CouponRequest;
import com.quickkart.order.dto.CouponResponse;
import com.quickkart.order.dto.PageResponse;
import com.quickkart.order.dto.ReturnResponse;
import com.quickkart.order.entity.Cart;
import com.quickkart.order.repository.CartRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.service.CartService;
import com.quickkart.order.service.CouponService;
import com.quickkart.order.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/** Coupons (shopper preview + admin CRUD), returns (admin decisions) and the admin view of open carts. */
@RestController
public class CommerceExtrasController {

    private final CouponService coupons;
    private final CartService carts;
    private final CartRepository cartRepository;
    private final UserRepository users;
    private final OrderService orders;

    public CommerceExtrasController(CouponService coupons, CartService carts, CartRepository cartRepository,
                                    UserRepository users, OrderService orders) {
        this.coupons = coupons;
        this.carts = carts;
        this.cartRepository = cartRepository;
        this.users = users;
        this.orders = orders;
    }

    // ---- shopper ----

    /** Offers shown at checkout. */
    @GetMapping("/api/cart/offers")
    public List<CouponResponse> offers() {
        return coupons.activeOffers();
    }

    /** What a code would take off the current cart: {"code":"WELCOME10"}. Nothing is reserved. */
    @PostMapping("/api/cart/coupon")
    public CouponQuote previewCoupon(Authentication auth, @RequestBody Map<String, String> body) {
        BigDecimal subtotal = carts.getCart(auth.getName()).getTotalAmount();
        if (subtotal == null || subtotal.signum() <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your cart is empty");
        Long userId = users.findByEmail(auth.getName()).map(u -> u.getId()).orElse(null);
        return coupons.quote(body.get("code"), userId, subtotal);
    }

    // ---- admin: coupons ----

    @GetMapping("/api/admin/coupons")
    public List<CouponResponse> allCoupons() {
        return coupons.all();
    }

    @PostMapping("/api/admin/coupons")
    public ResponseEntity<CouponResponse> createCoupon(@Valid @RequestBody CouponRequest request) {
        return new ResponseEntity<>(coupons.create(request), HttpStatus.CREATED);
    }

    @PutMapping("/api/admin/coupons/{id}")
    public CouponResponse updateCoupon(@PathVariable Long id, @Valid @RequestBody CouponRequest request) {
        return coupons.update(id, request);
    }

    @DeleteMapping("/api/admin/coupons/{id}")
    public ResponseEntity<Void> deleteCoupon(@PathVariable Long id) {
        coupons.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ---- admin: returns ----

    @GetMapping("/api/admin/returns")
    public PageResponse<ReturnResponse> returns(@RequestParam(required = false) String status,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "25") int size) {
        return orders.returnsForAdmin(status, page, size);
    }

    /** {"decision":"APPROVE"|"REJECT","note":"..."} */
    @PatchMapping("/api/admin/returns/{id}")
    public ReturnResponse resolveReturn(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String decision = body.getOrDefault("decision", "");
        if (!"APPROVE".equalsIgnoreCase(decision) && !"REJECT".equalsIgnoreCase(decision))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "decision must be APPROVE or REJECT");
        return orders.resolveReturn(id, "APPROVE".equalsIgnoreCase(decision), body.get("note"));
    }

    // ---- admin: open carts ----

    /** Non-empty carts, most recently changed first (abandoned-cart follow-up). */
    @GetMapping("/api/admin/carts")
    @Transactional(readOnly = true)
    public List<AdminCartResponse> openCarts() {
        return cartRepository.findAll().stream()
                .filter(c -> !c.getItems().isEmpty())
                .sorted(Comparator.comparing(Cart::getUpdatedAt, Comparator.nullsLast(Comparator.<LocalDateTime>reverseOrder())))
                .limit(200)
                .map(c -> {
                    List<AdminCartResponse.Line> lines = c.getItems().stream()
                            .map(i -> new AdminCartResponse.Line(i.getProduct().getId(), i.getProduct().getName(), i.getQuantity(), i.getProduct().getPrice()))
                            .toList();
                    BigDecimal total = lines.stream().map(l -> l.price().multiply(BigDecimal.valueOf(l.quantity()))).reduce(BigDecimal.ZERO, BigDecimal::add);
                    int count = lines.stream().mapToInt(AdminCartResponse.Line::quantity).sum();
                    return new AdminCartResponse(c.getId(), c.getUser().getId(), c.getUser().getName(), c.getUser().getEmail(),
                            count, total, c.getUpdatedAt(), lines);
                })
                .toList();
    }
}
