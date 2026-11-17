package com.quickkart.order;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.order.entity.Cart;
import com.quickkart.order.entity.CartItem;
import com.quickkart.order.entity.Order;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.User;
import com.quickkart.order.repository.CartItemRepository;
import com.quickkart.order.repository.CartRepository;
import com.quickkart.order.repository.OrderItemRepository;
import com.quickkart.order.repository.OrderRepository;
import com.quickkart.order.repository.ProductRepository;
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
class OrderControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CartRepository cartRepository;

    @Autowired
    private CartItemRepository cartItemRepository;

    @Autowired
    private OrderRepository orderRepository;

    @Autowired
    private OrderItemRepository orderItemRepository;

    @Autowired
    private com.quickkart.order.repository.PaymentRepository paymentRepository;

    @Autowired
    private JwtService jwtService;

    private User user1;
    private User user2;
    private String token1;
    private String token2;
    private Product product1;

    @BeforeEach
    void setUp() {
        paymentRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();
        cartItemRepository.deleteAll();
        cartRepository.deleteAll();

        user1 = userRepository.findByEmail("test_order_user1@example.com")
                .orElseGet(() -> userRepository.save(new User("Test User 1", "test_order_user1@example.com", "pass", "USER")));
        user2 = userRepository.findByEmail("test_order_user2@example.com")
                .orElseGet(() -> userRepository.save(new User("Test User 2", "test_order_user2@example.com", "pass", "USER")));

        user1.setEmailVerified(true); user1.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(user1);

        token1 = jwtService.generateToken(user1.getEmail(), user1.getRole(), user1.getId());
        user2.setEmailVerified(true); user2.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(user2);
        token2 = jwtService.generateToken(user2.getEmail(), user2.getRole(), user2.getId());

        product1 = productRepository.save(new Product("Ultrabook Pro", "Electronics", new BigDecimal("1200.00"), 10, "Computers"));
    }

    @Test
    void unauthenticatedOrderAccess_Returns401() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/orders/checkout"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void userCheckout_WithValidCart_Returns201AndDecrementsStock() throws Exception {
        // Setup user1 cart
        Cart cart = cartRepository.findByUserId(user1.getId())
                .orElseGet(() -> cartRepository.save(new Cart(user1)));
        cartItemRepository.deleteByCartId(cart.getId());
        CartItem cartItem = new CartItem(cart, product1, 2);
        cartItemRepository.save(cartItem);

        mockMvc.perform(post("/api/orders/checkout")
                        .header("Authorization", "Bearer " + token1).contentType(MediaType.APPLICATION_JSON).content(checkoutJson()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderId").isNumber())
                .andExpect(jsonPath("$.status").value("PLACED"))
                .andExpect(jsonPath("$.totalAmount").value(2400.00))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].quantity").value(2));

        // Verify stock in database was decremented from 10 to 8
        Product updatedProduct = productRepository.findById(product1.getId()).orElseThrow();
        assertEquals(8, updatedProduct.getStockQuantity());
    }

    @Test
    void userOrders_ReturnsOnlyOrdersForAuthenticatedUser() throws Exception {
        Order orderUser1 = orderRepository.save(new Order(user1, new BigDecimal("100.00"), "CONFIRMED", LocalDateTime.now().minusHours(1)));
        Order orderUser2 = orderRepository.save(new Order(user2, new BigDecimal("200.00"), "CONFIRMED", LocalDateTime.now()));

        mockMvc.perform(get("/api/orders")
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].orderId").value(orderUser1.getId()))
                .andExpect(jsonPath("$[0].totalAmount").value(100.00));
    }

    @Test
    void userGetOtherUserOrder_Returns404() throws Exception {
        Order orderUser2 = orderRepository.save(new Order(user2, new BigDecimal("200.00"), "CONFIRMED", LocalDateTime.now()));

        // User 1 attempts to access User 2's order
        mockMvc.perform(get("/api/orders/" + orderUser2.getId())
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isNotFound());
    }

    private String checkoutJson() throws Exception {
        var quote=mockMvc.perform(get("/api/cart").header("Authorization","Bearer "+token1)).andReturn().getResponse().getContentAsString();
        var mapper=new ObjectMapper();
        return mapper.writeValueAsString(java.util.Map.of("paymentMethod","COD","idempotencyKey",java.util.UUID.randomUUID().toString(),"cartFingerprint",mapper.readTree(quote).get("fingerprint").asText(),"recipientName","Customer","deliveryAddress","123 Test Street","deliveryPhone","9876543210"));
    }
}
