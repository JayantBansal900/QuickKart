package com.quickkart.order;

import com.quickkart.order.dto.AddCartItemRequest;
import com.quickkart.order.dto.CheckoutRequest;
import com.quickkart.order.dto.OrderResponse;
import com.quickkart.order.dto.UpdateOrderStatusRequest;
import com.quickkart.order.entity.Coupon;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.User;
import com.quickkart.order.repository.CouponRepository;
import com.quickkart.order.repository.OrderRepository;
import com.quickkart.order.repository.PaymentRepository;
import com.quickkart.order.repository.ProductRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.security.JwtService;
import com.quickkart.order.service.CartService;
import com.quickkart.order.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Coupons at checkout, dispatch with tracking, returns and the admin cart view. */
@SpringBootTest
@AutoConfigureMockMvc
class CouponDispatchReturnIntegrationTest {

    @Autowired OrderService orders;
    @Autowired CartService carts;
    @Autowired UserRepository users;
    @Autowired ProductRepository products;
    @Autowired CouponRepository coupons;
    @Autowired OrderRepository orderRepository;
    @Autowired PaymentRepository payments;
    @Autowired JwtService jwt;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    User user;
    Product product;

    @BeforeEach
    void setUp() {
        user = account("USER");
        product = products.saveAndFlush(new Product("Coupon test " + UUID.randomUUID(), "d", new BigDecimal("2500.00"), 20, "Test"));
    }

    User account(String role) {
        User u = new User("Customer", UUID.randomUUID() + "@example.invalid", "unused", role);
        u.setEmailVerified(true);
        u.setAccountStatus("ACTIVE");
        return users.saveAndFlush(u);
    }

    String bearer(User u) {
        return "Bearer " + jwt.generateToken(u.getEmail(), u.getRole(), u.getId());
    }

    Coupon coupon(String type, String value, String min, Integer limit, boolean once, String max) {
        Coupon c = new Coupon();
        c.setCode("T" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());
        c.setDiscountType(type);
        c.setDiscountValue(new BigDecimal(value));
        c.setMinOrderAmount(new BigDecimal(min));
        c.setUsageLimit(limit);
        c.setOncePerCustomer(once);
        c.setMaxDiscount(max == null ? null : new BigDecimal(max));
        return coupons.saveAndFlush(c);
    }

    CheckoutRequest checkout(User u, String code) {
        CheckoutRequest r = new CheckoutRequest();
        r.setPaymentMethod("COD");
        r.setIdempotencyKey(UUID.randomUUID().toString());
        r.setCartFingerprint(carts.getCart(u.getEmail()).getFingerprint());
        r.setRecipientName("Test Customer");
        r.setDeliveryAddress("123 Disposable Test Street");
        r.setDeliveryPhone("9876543210");
        r.setCouponCode(code);
        return r;
    }

    OrderResponse buy(User u, int qty, String code) {
        carts.addToCart(u.getEmail(), new AddCartItemRequest(product.getId(), qty));
        return orders.checkout(u.getEmail(), checkout(u, code));
    }

    int stock() {
        return products.findById(product.getId()).orElseThrow().getStockQuantity();
    }

    @Test
    void percentCouponIsCappedAndChargedOnTheOrder() {
        Coupon c = coupon("PERCENT", "10", "0", null, true, "300");
        OrderResponse order = buy(user, 2, c.getCode().toLowerCase()); // codes are case-insensitive
        assertEquals(0, new BigDecimal("5000.00").compareTo(order.getSubtotalAmount()));
        assertEquals(0, new BigDecimal("300.00").compareTo(order.getDiscountAmount())); // 10% = 500, capped at 300
        assertEquals(0, new BigDecimal("4700.00").compareTo(order.getTotalAmount()));
        assertEquals(c.getCode(), order.getCouponCode());
        assertEquals(0, new BigDecimal("4700.00").compareTo(payments.findByOrderId(order.getOrderId()).orElseThrow().getAmount()));
        assertEquals(1, coupons.findById(c.getId()).orElseThrow().getUsedCount());
    }

    @Test
    void couponRulesAreEnforcedAndAFailedCouponPlacesNothing() {
        Coupon min = coupon("FLAT", "200", "9999", null, false, null);
        carts.addToCart(user.getEmail(), new AddCartItemRequest(product.getId(), 1));
        var request = checkout(user, min.getCode());
        var tooSmall = assertThrows(ResponseStatusException.class, () -> orders.checkout(user.getEmail(), request));
        assertEquals(400, tooSmall.getStatusCode().value());
        assertTrue(tooSmall.getReason().contains("more to use"));
        assertEquals(20, stock()); // nothing reserved
        assertEquals(1, carts.getCart(user.getEmail()).getItems().size());

        var unknown = checkout(user, "NOPE-NOT-REAL");
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> orders.checkout(user.getEmail(), unknown)).getStatusCode().value());

        Coupon once = coupon("FLAT", "100", "0", null, true, null);
        assertEquals(0, new BigDecimal("100.00").compareTo(orders.checkout(user.getEmail(), checkout(user, once.getCode())).getDiscountAmount()));
        carts.addToCart(user.getEmail(), new AddCartItemRequest(product.getId(), 1));
        var again = checkout(user, once.getCode());
        assertTrue(assertThrows(ResponseStatusException.class, () -> orders.checkout(user.getEmail(), again)).getReason().contains("already used"));

        Coupon limited = coupon("FLAT", "50", "0", 1, false, null);
        limited.setUsedCount(1);
        coupons.saveAndFlush(limited);
        var full = checkout(user, limited.getCode());
        assertTrue(assertThrows(ResponseStatusException.class, () -> orders.checkout(user.getEmail(), full)).getReason().contains("fully used"));

        Coupon expired = coupon("FLAT", "50", "0", null, false, null);
        expired.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        coupons.saveAndFlush(expired);
        var late = checkout(user, expired.getCode());
        assertTrue(assertThrows(ResponseStatusException.class, () -> orders.checkout(user.getEmail(), late)).getReason().contains("expired"));
    }

    @Test
    void cancellingGivesTheCouponUseBack() {
        Coupon c = coupon("FLAT", "100", "0", 1, true, null);
        OrderResponse order = buy(user, 1, c.getCode());
        assertEquals(1, coupons.findById(c.getId()).orElseThrow().getUsedCount());
        orders.cancelOrder(user.getEmail(), order.getOrderId());
        assertEquals(0, coupons.findById(c.getId()).orElseThrow().getUsedCount());
        // the customer may use a once-per-customer code again after cancelling
        assertEquals(c.getCode(), buy(user, 1, c.getCode()).getCouponCode());
    }

    @Test
    void couponPreviewAndAdminCouponApi() throws Exception {
        User admin = account("ADMIN");
        mvc.perform(post("/api/admin/coupons").header("Authorization", bearer(user)).contentType("application/json")
                        .content("{\"code\":\"SAVE5\",\"discountType\":\"PERCENT\",\"discountValue\":5}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/coupons").header("Authorization", bearer(admin)).contentType("application/json")
                        .content("{\"code\":\"save5\",\"description\":\"5% off\",\"discountType\":\"PERCENT\",\"discountValue\":5}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SAVE5"));
        mvc.perform(post("/api/admin/coupons").header("Authorization", bearer(admin)).contentType("application/json")
                        .content("{\"code\":\"SAVE5\",\"discountType\":\"FLAT\",\"discountValue\":5}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/admin/coupons").header("Authorization", bearer(admin)).contentType("application/json")
                        .content("{\"code\":\"HUGE\",\"discountType\":\"PERCENT\",\"discountValue\":95}"))
                .andExpect(status().isBadRequest());

        carts.addToCart(user.getEmail(), new AddCartItemRequest(product.getId(), 2));
        mvc.perform(post("/api/cart/coupon").header("Authorization", bearer(user)).contentType("application/json").content("{\"code\":\"save5\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.discount").value(250.00))
                .andExpect(jsonPath("$.total").value(4750.00));
        mvc.perform(get("/api/cart/offers").header("Authorization", bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.code=='SAVE5')]").exists());
        mvc.perform(get("/api/admin/carts").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.customerEmail=='" + user.getEmail() + "')].itemCount").value(2));
    }

    @Test
    void dispatchNeedsTrackingAndDeliveryAllowsAReturn() throws Exception {
        OrderResponse order = buy(user, 2, null);
        long id = order.getOrderId();
        orders.updateOrderStatus(id, new UpdateOrderStatusRequest("CONFIRMED"));
        orders.updateOrderStatus(id, new UpdateOrderStatusRequest("PROCESSING"));
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> orders.updateOrderStatus(id, new UpdateOrderStatusRequest("SHIPPED"))).getStatusCode().value());
        UpdateOrderStatusRequest ship = new UpdateOrderStatusRequest("SHIPPED");
        ship.setCourier("Delhivery");
        ship.setTrackingNumber("dl-123456789");
        OrderResponse shipped = orders.updateOrderStatus(id, ship);
        assertEquals("DL-123456789", shipped.getTrackingNumber());
        assertEquals("Delhivery", shipped.getCourier());
        assertFalse(shipped.getReturnable());
        assertEquals(1, jdbc.queryForObject("select count(*) from outbox_events where event_id=? and payload like '%DL-123456789%'",
                Integer.class, "ORDER_STATUS-" + id + "-SHIPPED"));

        orders.updateOrderStatus(id, new UpdateOrderStatusRequest("OUT_FOR_DELIVERY"));
        OrderResponse delivered = orders.updateOrderStatus(id, new UpdateOrderStatusRequest("DELIVERED"));
        assertTrue(delivered.getReturnable());
        assertEquals(18, stock());

        User stranger = account("USER");
        mvc.perform(post("/api/orders/" + id + "/return").header("Authorization", bearer(stranger)).contentType("application/json")
                        .content("{\"reason\":\"DAMAGED\"}"))
                .andExpect(status().isNotFound());
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> orders.requestReturn(user.getEmail(), id, "BORED", null)).getStatusCode().value());
        OrderResponse requested = orders.requestReturn(user.getEmail(), id, "damaged", "Box was crushed");
        assertEquals("REQUESTED", requested.getReturnStatus());
        assertFalse(requested.getReturnable());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> orders.requestReturn(user.getEmail(), id, "DAMAGED", null)).getStatusCode().value());

        User admin = account("ADMIN");
        Long returnId = jdbc.queryForObject("select id from order_returns where order_id=?", Long.class, id);
        mvc.perform(get("/api/admin/returns").param("status", "REQUESTED").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id==" + returnId + ")].reason").value("DAMAGED"));
        mvc.perform(patch("/api/admin/returns/" + returnId).header("Authorization", bearer(admin)).contentType("application/json")
                        .content("{\"decision\":\"APPROVE\",\"note\":\"Refund issued\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.order.status").value("RETURNED"))
                .andExpect(jsonPath("$.order.paymentStatus").value("REFUNDED"));
        assertEquals(20, stock()); // stock is back
        mvc.perform(patch("/api/admin/returns/" + returnId).header("Authorization", bearer(admin)).contentType("application/json")
                        .content("{\"decision\":\"REJECT\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void returnWindowIsEnforced() {
        OrderResponse order = buy(user, 1, null);
        long id = order.getOrderId();
        for (String s : new String[]{"CONFIRMED", "PROCESSING"}) orders.updateOrderStatus(id, new UpdateOrderStatusRequest(s));
        UpdateOrderStatusRequest ship = new UpdateOrderStatusRequest("SHIPPED");
        ship.setCourier("Blue Dart");
        ship.setTrackingNumber("BD1");
        orders.updateOrderStatus(id, ship);
        orders.updateOrderStatus(id, new UpdateOrderStatusRequest("OUT_FOR_DELIVERY"));
        orders.updateOrderStatus(id, new UpdateOrderStatusRequest("DELIVERED"));
        jdbc.update("update orders set delivered_at=? where id=?", LocalDateTime.now().minusDays(8), id);
        assertFalse(orders.getOrderById(user.getEmail(), id).getReturnable());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> orders.requestReturn(user.getEmail(), id, "OTHER", null)).getStatusCode().value());
        assertNull(orders.getOrderById(user.getEmail(), id).getReturnStatus());
    }
}
