package com.quickkart.order;

import com.quickkart.order.dto.AddCartItemRequest;
import com.quickkart.order.dto.CartItemResponse;
import com.quickkart.order.dto.CheckoutRequest;
import com.quickkart.order.dto.OrderResponse;
import com.quickkart.order.dto.UpdateOrderStatusRequest;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.ProductVariant;
import com.quickkart.order.entity.User;
import com.quickkart.order.exception.InsufficientStockException;
import com.quickkart.order.repository.OrderReturnRepository;
import com.quickkart.order.repository.ProductRepository;
import com.quickkart.order.repository.ProductVariantRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.service.CartService;
import com.quickkart.order.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import com.quickkart.order.security.JwtService;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Sizes: the cart, checkout, cancel and return all work per size, and the product total follows. */
@SpringBootTest
@AutoConfigureMockMvc
class VariantCheckoutIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired JwtService jwt;

    @Autowired OrderService orders;
    @Autowired CartService carts;
    @Autowired UserRepository users;
    @Autowired ProductRepository products;
    @Autowired ProductVariantRepository variants;
    @Autowired OrderReturnRepository returns;
    @Autowired JdbcTemplate jdbc;

    User user;
    Product shirt;
    ProductVariant medium;
    ProductVariant large;

    @BeforeEach
    void setUp() {
        User u = new User("Customer", UUID.randomUUID() + "@example.invalid", "unused", "USER");
        u.setEmailVerified(true);
        u.setAccountStatus("ACTIVE");
        user = users.saveAndFlush(u);
        shirt = products.saveAndFlush(new Product("Oxford shirt " + UUID.randomUUID(), "d", new BigDecimal("1500.00"), 8, "Shirts"));
        medium = variants.saveAndFlush(new ProductVariant(shirt, "M", "Navy", 5));
        large = variants.saveAndFlush(new ProductVariant(shirt, "L", "Navy", 3));
    }

    CheckoutRequest checkout() {
        CheckoutRequest r = new CheckoutRequest();
        r.setPaymentMethod("COD");
        r.setIdempotencyKey(UUID.randomUUID().toString());
        r.setCartFingerprint(carts.getCart(user.getEmail()).getFingerprint());
        r.setRecipientName("Test Customer");
        r.setDeliveryAddress("123 Disposable Test Street");
        r.setDeliveryPhone("9876543210");
        return r;
    }

    int productStock() { return products.findById(shirt.getId()).orElseThrow().getStockQuantity(); }
    int sizeStock(ProductVariant v) { return variants.findById(v.getId()).orElseThrow().getStockQuantity(); }

    @Test
    void aSizeMustBeChosenWhenTheProductHasSizes() {
        var noSize = assertThrows(IllegalArgumentException.class,
                () -> carts.addToCart(user.getEmail(), new AddCartItemRequest(shirt.getId(), 1)));
        assertTrue(noSize.getMessage().contains("Choose a size"));

        ProductVariant foreign = variants.saveAndFlush(new ProductVariant(
                products.saveAndFlush(new Product("Other " + UUID.randomUUID(), "d", BigDecimal.TEN, 1, "Shirts")), "M", "", 1));
        var wrong = new AddCartItemRequest(shirt.getId(), 1);
        wrong.setVariantId(foreign.getId());
        assertThrows(IllegalArgumentException.class, () -> carts.addToCart(user.getEmail(), wrong));
    }

    @Test
    void eachSizeIsItsOwnCartLineWithItsOwnStockLimit() {
        AddCartItemRequest m = new AddCartItemRequest(shirt.getId(), 2);
        m.setVariantId(medium.getId());
        AddCartItemRequest l = new AddCartItemRequest(shirt.getId(), 3);
        l.setVariantId(large.getId());
        carts.addToCart(user.getEmail(), m);
        var cart = carts.addToCart(user.getEmail(), l);

        assertEquals(2, cart.getItems().size());
        CartItemResponse lLine = cart.getItems().stream().filter(i -> "L".equals(i.getSize())).findFirst().orElseThrow();
        assertEquals(3, lLine.getAvailableQuantity()); // limited by the size, not the product total of 8
        assertEquals("Navy", lLine.getColor());

        AddCartItemRequest tooMany = new AddCartItemRequest(shirt.getId(), 1);
        tooMany.setVariantId(large.getId());
        assertThrows(InsufficientStockException.class, () -> carts.addToCart(user.getEmail(), tooMany)); // L already 3 of 3

        // Adding more of an existing size merges into the same line.
        AddCartItemRequest more = new AddCartItemRequest(shirt.getId(), 1);
        more.setVariantId(medium.getId());
        assertEquals(2, carts.addToCart(user.getEmail(), more).getItems().size());
    }

    @Test
    void checkoutTakesStockFromTheChosenSizeOnly() {
        AddCartItemRequest m = new AddCartItemRequest(shirt.getId(), 2);
        m.setVariantId(medium.getId());
        carts.addToCart(user.getEmail(), m);
        OrderResponse order = orders.checkout(user.getEmail(), checkout());

        assertEquals(3, sizeStock(medium));
        assertEquals(3, sizeStock(large));
        assertEquals(6, productStock());
        assertEquals("M", order.getItems().get(0).getSize());
        assertEquals("Navy", order.getItems().get(0).getColor());
        assertEquals(1, jdbc.queryForObject("select count(*) from stock_movements where product_id=? and reference like '%M / Navy%'",
                Integer.class, shirt.getId()));
    }

    @Test
    void cancellingPutsTheSizeBack() {
        AddCartItemRequest l = new AddCartItemRequest(shirt.getId(), 3);
        l.setVariantId(large.getId());
        carts.addToCart(user.getEmail(), l);
        OrderResponse order = orders.checkout(user.getEmail(), checkout());
        assertEquals(0, sizeStock(large));
        assertEquals(5, productStock());

        orders.cancelOrder(user.getEmail(), order.getOrderId());
        assertEquals(3, sizeStock(large));
        assertEquals(8, productStock());
    }

    @Test
    void anApprovedReturnPutsTheSizeBack() {
        AddCartItemRequest m = new AddCartItemRequest(shirt.getId(), 4);
        m.setVariantId(medium.getId());
        carts.addToCart(user.getEmail(), m);
        long id = orders.checkout(user.getEmail(), checkout()).getOrderId();
        for (String s : new String[]{"CONFIRMED", "PROCESSING"}) orders.updateOrderStatus(id, new UpdateOrderStatusRequest(s));
        UpdateOrderStatusRequest ship = new UpdateOrderStatusRequest("SHIPPED");
        ship.setCourier("Delhivery");
        ship.setTrackingNumber("DL123456");
        orders.updateOrderStatus(id, ship);
        for (String s : new String[]{"OUT_FOR_DELIVERY", "DELIVERED"}) orders.updateOrderStatus(id, new UpdateOrderStatusRequest(s));
        assertEquals(1, sizeStock(medium));

        orders.requestReturn(user.getEmail(), id, "OTHER", "Too tight");
        orders.resolveReturn(returns.findByOrderId(id).orElseThrow().getId(), true, null);
        assertEquals(5, sizeStock(medium));
        assertEquals(8, productStock());
    }

    @Test
    void productsWithoutSizesStillWorkAsBefore() {
        Product wallet = products.saveAndFlush(new Product("Wallet " + UUID.randomUUID(), "d", new BigDecimal("999.00"), 4, "Accessories"));
        var cart = carts.addToCart(user.getEmail(), new AddCartItemRequest(wallet.getId(), 2));
        assertNull(cart.getItems().get(0).getVariantId());
        orders.checkout(user.getEmail(), checkout());
        assertEquals(2, products.findById(wallet.getId()).orElseThrow().getStockQuantity());
    }

    @Test
    void theCartApiAcceptsAndReturnsTheChosenSize() throws Exception {
        String bearer = "Bearer " + jwt.generateToken(user.getEmail(), user.getRole(), user.getId());
        mvc.perform(post("/api/cart/items").header("Authorization", bearer).contentType("application/json")
                        .content("{\"productId\":" + shirt.getId() + ",\"quantity\":1}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/cart/items").header("Authorization", bearer).contentType("application/json")
                        .content("{\"productId\":" + shirt.getId() + ",\"quantity\":2,\"variantId\":" + medium.getId() + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].size").value("M"))
                .andExpect(jsonPath("$.items[0].color").value("Navy"))
                .andExpect(jsonPath("$.items[0].availableQuantity").value(5));
    }
}
