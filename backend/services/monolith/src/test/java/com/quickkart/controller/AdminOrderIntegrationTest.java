package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.UpdateOrderStatusRequest;
import com.quickkart.entity.Order;
import com.quickkart.entity.User;
import com.quickkart.repository.OrderItemRepository;
import com.quickkart.repository.OrderRepository;
import com.quickkart.repository.PaymentRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
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
class AdminOrderIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    private User adminUser;
    private User normalUser1;
    private User normalUser2;
    private String adminToken;
    private String user1Token;
    private String user2Token;
    private Order order1;
    private Order order2;

    @BeforeEach
    void setUp() {
        paymentRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();

        adminUser = userRepository.findByEmail("admin_orders@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("Admin Order User", "admin_orders@quickkart.com", "pass123", "ADMIN")));
        normalUser1 = userRepository.findByEmail("normal_orders1@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("Normal User 1", "normal_orders1@quickkart.com", "pass123", "USER")));
        normalUser2 = userRepository.findByEmail("normal_orders2@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("Normal User 2", "normal_orders2@quickkart.com", "pass123", "USER")));

        adminUser.setEmailVerified(true); adminUser.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(adminUser);

        adminToken = jwtService.generateToken(adminUser);
        normalUser1.setEmailVerified(true); normalUser1.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(normalUser1);
        user1Token = jwtService.generateToken(normalUser1);
        normalUser2.setEmailVerified(true); normalUser2.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(normalUser2);
        user2Token = jwtService.generateToken(normalUser2);

        order1 = orderRepository.save(new Order(normalUser1, new BigDecimal("199.99"), "CONFIRMED", LocalDateTime.now().minusDays(1)));
        order2 = orderRepository.save(new Order(normalUser2, new BigDecimal("499.00"), "PROCESSING", LocalDateTime.now()));
    }

    @Test
    void test14_AdminCanViewAllOrders() throws Exception {
        mockMvc.perform(get("/api/admin/orders")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[*].orderId", containsInAnyOrder(order1.getId().intValue(), order2.getId().intValue())));
    }

    @Test
    void test15_AdminCanViewSpecificOrder() throws Exception {
        mockMvc.perform(get("/api/admin/orders/" + order1.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(order1.getId()))
                .andExpect(jsonPath("$.totalAmount").value(199.99))
                .andExpect(jsonPath("$.status").value("CONFIRMED"));

        mockMvc.perform(get("/api/admin/orders/" + order2.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(order2.getId()))
                .andExpect(jsonPath("$.totalAmount").value(499.00))
                .andExpect(jsonPath("$.status").value("PROCESSING"));
    }

    @Test
    void test16_AdminCanUpdateOrderStatus() throws Exception {
        order1.setCheckoutKey("admin-fixture"); orderRepository.saveAndFlush(order1);
        paymentRepository.saveAndFlush(new com.quickkart.entity.Payment(order1,order1.getTotalAmount(),"COLLECTION_PENDING","COD","test-admin",LocalDateTime.now()));

        UpdateOrderStatusRequest request = new UpdateOrderStatusRequest("PROCESSING");

        mockMvc.perform(patch("/api/admin/orders/" + order1.getId() + "/status")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(order1.getId()))
                .andExpect(jsonPath("$.status").value("PROCESSING"));

        Order updated = orderRepository.findById(order1.getId()).orElseThrow();
        assertEquals("PROCESSING", updated.getStatus());
    }

    @Test
    void test17_UserCannotAccessAdminOrderApis() throws Exception {
        UpdateOrderStatusRequest updateRequest = new UpdateOrderStatusRequest("DELIVERED");

        // Normal USER receives 403 on GET /api/admin/orders
        mockMvc.perform(get("/api/admin/orders")
                        .header("Authorization", "Bearer " + user1Token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));

        // Normal USER receives 403 on GET /api/admin/orders/{id}
        mockMvc.perform(get("/api/admin/orders/" + order1.getId())
                        .header("Authorization", "Bearer " + user1Token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));

        // Normal USER receives 403 on PATCH /api/admin/orders/{id}/status
        mockMvc.perform(patch("/api/admin/orders/" + order1.getId() + "/status")
                        .header("Authorization", "Bearer " + user1Token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void test18_UnauthenticatedUserCannotAccessAdminOrderApis() throws Exception {
        UpdateOrderStatusRequest updateRequest = new UpdateOrderStatusRequest("DELIVERED");

        mockMvc.perform(get("/api/admin/orders"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(get("/api/admin/orders/" + order1.getId()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(patch("/api/admin/orders/" + order1.getId() + "/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void invalidOrderStatus_ShouldReturnBadRequest() throws Exception {
        UpdateOrderStatusRequest invalidRequest = new UpdateOrderStatusRequest("FLYING");

        mockMvc.perform(patch("/api/admin/orders/" + order1.getId() + "/status")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Invalid Order Status"));
    }

    @Test
    void normalUserOrderIsolation_IsPreserved() throws Exception {
        // User 1 sees only user 1's order
        mockMvc.perform(get("/api/orders")
                        .header("Authorization", "Bearer " + user1Token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].orderId").value(order1.getId()));

        // User 1 cannot view user 2's order
        mockMvc.perform(get("/api/orders/" + order2.getId())
                        .header("Authorization", "Bearer " + user1Token))
                .andExpect(status().isNotFound());
    }
}
