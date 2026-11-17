package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.PaymentRequest;
import com.quickkart.entity.Cart;
import com.quickkart.entity.CartItem;
import com.quickkart.entity.Order;
import com.quickkart.entity.OrderItem;
import com.quickkart.entity.Payment;
import com.quickkart.entity.Product;
import com.quickkart.entity.User;
import com.quickkart.repository.CartItemRepository;
import com.quickkart.repository.CartRepository;
import com.quickkart.repository.OrderRepository;
import com.quickkart.repository.PaymentRepository;
import com.quickkart.repository.ProductRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PaymentIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private JwtService jwtService;

    private User user1;
    private User user2;
    private String token1;
    private String token2;
    private Order orderUser1;
    private Order orderUser2;

    @BeforeEach
    void setUp() {
        paymentRepository.deleteAll();
        orderRepository.deleteAll();

        user1 = userRepository.findByEmail("pay_user1@example.com")
                .orElseGet(() -> userRepository.save(new User("Pay User 1", "pay_user1@example.com", "pass123", "USER")));
        user2 = userRepository.findByEmail("pay_user2@example.com")
                .orElseGet(() -> userRepository.save(new User("Pay User 2", "pay_user2@example.com", "pass123", "USER")));

        user1.setEmailVerified(true); user1.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(user1);

        token1 = jwtService.generateToken(user1);
        user2.setEmailVerified(true); user2.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(user2);
        token2 = jwtService.generateToken(user2);

        // Create order for user 1
        orderUser1 = new Order(user1, new BigDecimal("299.99"), "CONFIRMED", LocalDateTime.now());
        orderUser1 = orderRepository.save(orderUser1);

        // Create order for user 2
        orderUser2 = new Order(user2, new BigDecimal("149.50"), "CONFIRMED", LocalDateTime.now());
        orderUser2 = orderRepository.save(orderUser2);
    }











    @Test
    void test6_UserCanRetrievePaymentForOwnOrder() throws Exception {
        // Process payment first
        Payment payment = new Payment(
                orderUser1,
                orderUser1.getTotalAmount(),
                "SUCCESS",
                "CARD",
                "TXN-EXISTING123",
                LocalDateTime.now()
        );
        paymentRepository.save(payment);

        mockMvc.perform(get("/api/payments/order/" + orderUser1.getId())
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(orderUser1.getId()))
                .andExpect(jsonPath("$.status").value("LEGACY_UNVERIFIED"))
                .andExpect(jsonPath("$.transactionId").value("TXN-EXISTING123"))
                .andExpect(jsonPath("$.amount").value(299.99));

        // User 2 cannot retrieve payment for User 1's order
        mockMvc.perform(get("/api/payments/order/" + orderUser1.getId())
                        .header("Authorization", "Bearer " + token2))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void test7_UnauthenticatedPaymentRequestIsRejected() throws Exception {
        PaymentRequest request = new PaymentRequest(orderUser1.getId(), "CARD");

        // Unauthenticated POST /api/payments -> 401
        mockMvc.perform(post("/api/payments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        // Unauthenticated GET /api/payments/order/{id} -> 401
        mockMvc.perform(get("/api/payments/order/" + orderUser1.getId()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }





    @Test void unsupportedPaymentRequestsCannotCreateOrConfirmPayment() throws Exception {
        for (String method : java.util.List.of("CARD","UPI","COD","BITCOIN")) {
            for (String token : java.util.List.of(token1,token2)) {
                mockMvc.perform(post("/api/payments").header("Authorization","Bearer "+token)
                    .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(new PaymentRequest(orderUser1.getId(),method))))
                    .andExpect(status().isNotImplemented());
            }
        }
        assertTrue(paymentRepository.findByOrderId(orderUser1.getId()).isEmpty());
    }
}
