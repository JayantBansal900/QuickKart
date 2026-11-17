package com.quickkart.order;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.order.dto.UpdateOrderStatusRequest;
import com.quickkart.order.entity.Order;
import com.quickkart.order.entity.User;
import com.quickkart.order.repository.OrderItemRepository;
import com.quickkart.order.repository.OrderRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.security.JwtService;
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
class AdminOrderControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @Autowired
    private com.quickkart.order.repository.PaymentRepository paymentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    private User adminUser;
    private User normalUser;
    private String adminToken;
    private String userToken;
    private Order testOrder;

    @BeforeEach
    void setUp() {
        paymentRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();

        adminUser = userRepository.findByEmail("admin_order_test@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("Admin Tester", "admin_order_test@quickkart.com", "pass", "ADMIN")));
        normalUser = userRepository.findByEmail("user_order_test@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("User Tester", "user_order_test@quickkart.com", "pass", "USER")));

        adminUser.setEmailVerified(true); adminUser.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(adminUser);

        adminToken = jwtService.generateToken(adminUser.getEmail(), adminUser.getRole(), adminUser.getId());
        normalUser.setEmailVerified(true); normalUser.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(normalUser);
        userToken = jwtService.generateToken(normalUser.getEmail(), normalUser.getRole(), normalUser.getId());

        testOrder = orderRepository.save(new Order(normalUser, new BigDecimal("149.99"), "CONFIRMED", LocalDateTime.now()));
    }

    @Test
    void unauthenticatedAdminAccess_Returns401() throws Exception {
        mockMvc.perform(get("/api/admin/orders"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void userTokenAccess_Returns403Forbidden() throws Exception {
        mockMvc.perform(get("/api/admin/orders")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        UpdateOrderStatusRequest req = new UpdateOrderStatusRequest("SHIPPED");
        mockMvc.perform(patch("/api/admin/orders/" + testOrder.getId() + "/status")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminTokenAccess_CanViewAllOrders() throws Exception {
        mockMvc.perform(get("/api/admin/orders")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].orderId").value(testOrder.getId()));
    }

    @Test
    void adminTokenAccess_CanUpdateOrderStatus() throws Exception {
        testOrder.setCheckoutKey("admin-fixture"); orderRepository.saveAndFlush(testOrder);
        paymentRepository.saveAndFlush(new com.quickkart.order.entity.Payment(testOrder,testOrder.getTotalAmount(),"COLLECTION_PENDING","COD","test-admin",LocalDateTime.now()));

        UpdateOrderStatusRequest req = new UpdateOrderStatusRequest("PROCESSING");

        mockMvc.perform(patch("/api/admin/orders/" + testOrder.getId() + "/status")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PROCESSING"));

        Order reloaded = orderRepository.findById(testOrder.getId()).orElseThrow();
        assertEquals("PROCESSING", reloaded.getStatus());
    }

    @Test
    void adminTokenAccess_InvalidStatus_Returns400() throws Exception {
        UpdateOrderStatusRequest req = new UpdateOrderStatusRequest("SOME_INVALID_STATUS");

        mockMvc.perform(patch("/api/admin/orders/" + testOrder.getId() + "/status")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest());
    }
}
