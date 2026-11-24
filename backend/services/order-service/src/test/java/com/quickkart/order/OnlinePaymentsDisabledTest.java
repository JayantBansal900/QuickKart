package com.quickkart.order;

import com.quickkart.order.dto.AddCartItemRequest;
import com.quickkart.order.dto.CheckoutRequest;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.User;
import com.quickkart.order.repository.ProductRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.security.JwtService;
import com.quickkart.order.service.CartService;
import com.quickkart.order.service.OrderService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** What production does: the simulated gateway is off, so only cash on delivery is accepted. */
@SpringBootTest(properties = "app.payments.simulated-online.enabled=false")
@AutoConfigureMockMvc
class OnlinePaymentsDisabledTest {

    @Autowired OrderService orders;
    @Autowired CartService carts;
    @Autowired UserRepository users;
    @Autowired ProductRepository products;
    @Autowired JwtService jwt;
    @Autowired MockMvc mvc;

    @Test
    void onlyCashOnDeliveryIsOfferedAndAccepted() throws Exception {
        User user = new User("Customer", UUID.randomUUID() + "@example.invalid", "unused", "USER");
        user.setEmailVerified(true);
        user.setAccountStatus("ACTIVE");
        user = users.saveAndFlush(user);
        Product product = products.saveAndFlush(new Product("Gate test", "d", new BigDecimal("10.00"), 5, "Test"));

        mvc.perform(get("/api/orders/payment-methods").header("Authorization", "Bearer " + jwt.generateToken(user.getEmail(), "USER", user.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.methods.length()").value(1))
                .andExpect(jsonPath("$.methods[0]").value("COD"));

        carts.addToCart(user.getEmail(), new AddCartItemRequest(product.getId(), 1));
        CheckoutRequest request = new CheckoutRequest();
        request.setPaymentMethod("UPI");
        request.setIdempotencyKey(UUID.randomUUID().toString());
        request.setCartFingerprint(carts.getCart(user.getEmail()).getFingerprint());
        request.setRecipientName("Test Customer");
        request.setDeliveryAddress("123 Disposable Test Street");
        request.setDeliveryPhone("9876543210");
        String email = user.getEmail();
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> orders.checkout(email, request)).getStatusCode().value());
        assertEquals(5, products.findById(product.getId()).orElseThrow().getStockQuantity());

        request.setPaymentMethod("COD");
        assertEquals("PLACED", orders.checkout(email, request).getStatus());
    }
}
