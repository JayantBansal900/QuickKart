package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.AddCartItemRequest;
import com.quickkart.entity.Cart;
import com.quickkart.entity.CartItem;
import com.quickkart.entity.Order;
import com.quickkart.entity.Product;
import com.quickkart.entity.User;
import com.quickkart.repository.CartItemRepository;
import com.quickkart.repository.CartRepository;
import com.quickkart.repository.OrderItemRepository;
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
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OrderIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

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
    private PaymentRepository paymentRepository;

    @Autowired
    private JwtService jwtService;

    private User user1;
    private User user2;
    private String token1;
    private String token2;
    private Product product1;
    private Product product2;

    @BeforeEach
    void setUp() {
        paymentRepository.deleteAll();
        orderItemRepository.deleteAll();
        orderRepository.deleteAll();
        cartItemRepository.deleteAll();
        cartRepository.deleteAll();

        user1 = userRepository.findByEmail("orderuser1@example.com")
                .orElseGet(() -> userRepository.save(new User("Order User 1", "orderuser1@example.com", "pass", "USER")));
        user2 = userRepository.findByEmail("orderuser2@example.com")
                .orElseGet(() -> userRepository.save(new User("Order User 2", "orderuser2@example.com", "pass", "USER")));

        user1.setEmailVerified(true); user1.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(user1);

        token1 = jwtService.generateToken(user1);
        user2.setEmailVerified(true); user2.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(user2);
        token2 = jwtService.generateToken(user2);

        product1 = productRepository.save(new Product("Gaming Laptop", "16GB RAM", new BigDecimal("1000.00"), 5, "Computers"));
        product2 = productRepository.save(new Product("Mechanical Keyboard", "Blue Switch", new BigDecimal("100.00"), 10, "Accessories"));
    }

    @Test
    void unauthenticatedOrderAccess_ShouldReturn401() throws Exception {
        mockMvc.perform(get("/api/orders"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(post("/api/orders"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/orders/1"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void checkoutWithEmptyCart_ShouldReturn400() throws Exception {
        mockMvc.perform(post("/api/orders")
                        .header("Authorization", "Bearer " + token1).contentType(MediaType.APPLICATION_JSON).content(checkoutJson()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Empty Cart"));
    }

    @Test
    void successfulCheckout_ShouldCreateOrder_DecreaseStock_AndClearCart() throws Exception {
        // 1. Add products to cart
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + token1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(product1.getId(), 2))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + token1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(product2.getId(), 3))))
                .andExpect(status().isOk());

        // 2. Checkout
        MvcResult result = mockMvc.perform(post("/api/orders")
                        .header("Authorization", "Bearer " + token1).contentType(MediaType.APPLICATION_JSON).content(checkoutJson()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderId").exists())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.totalAmount").value(2300.00)) // 2*1000 + 3*100 = 2300.00
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andReturn();

        // 3. Verify stock decreased
        Product updatedProduct1 = productRepository.findById(product1.getId()).orElseThrow();
        assertEquals(3, updatedProduct1.getStockQuantity()); // 5 - 2 = 3

        Product updatedProduct2 = productRepository.findById(product2.getId()).orElseThrow();
        assertEquals(7, updatedProduct2.getStockQuantity()); // 10 - 3 = 7

        // 4. Verify cart is cleared
        mockMvc.perform(get("/api/cart")
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalAmount").value(0));
    }

    @Test
    void orderItem_ShouldStorePriceSnapshot_EvenIfProductPriceChangesLater() throws Exception {
        // Add product at price 1000.00
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + token1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(product1.getId(), 1))))
                .andExpect(status().isOk());

        // Checkout
        mockMvc.perform(post("/api/orders")
                        .header("Authorization", "Bearer " + token1).contentType(MediaType.APPLICATION_JSON).content(checkoutJson()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.items[0].price").value(1000.00));

        // Change product price to 1500.00
        product1.setPrice(new BigDecimal("1500.00"));
        productRepository.save(product1);

        // Fetch user's orders and verify historical price is still 1000.00
        mockMvc.perform(get("/api/orders")
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].items[0].price").value(1000.00))
                .andExpect(jsonPath("$[0].totalAmount").value(1000.00));
    }

    @Test
    void checkout_ShouldRejectWhenStockIsInsufficient() throws Exception {
        // Add 2 items
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + token1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(product1.getId(), 2))))
                .andExpect(status().isOk());

        // Simulate stock drop to 1 (less than cart quantity of 2)
        product1.setStockQuantity(1);
        productRepository.save(product1);

        // Checkout should fail with 409 Conflict
        mockMvc.perform(post("/api/orders")
                        .header("Authorization", "Bearer " + token1).contentType(MediaType.APPLICATION_JSON).content(checkoutJson()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.error").value("Insufficient Stock"));

        // Verify cart is NOT cleared
        mockMvc.perform(get("/api/cart")
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)));

        // Verify stock is untouched
        Product unchangedProduct = productRepository.findById(product1.getId()).orElseThrow();
        assertEquals(1, unchangedProduct.getStockQuantity());
    }

    @Test
    void userCannotRetrieveAnotherUsersOrder() throws Exception {
        // User 1 creates order
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + token1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(product2.getId(), 1))))
                .andExpect(status().isOk());

        String responseStr = mockMvc.perform(post("/api/orders")
                        .header("Authorization", "Bearer " + token1).contentType(MediaType.APPLICATION_JSON).content(checkoutJson()))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        Long user1OrderId = objectMapper.readTree(responseStr).get("orderId").asLong();

        // User 1 can view own order
        mockMvc.perform(get("/api/orders/" + user1OrderId)
                        .header("Authorization", "Bearer " + token1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value(user1OrderId));

        // User 2 tries to access User 1's order -> must return 404 Not Found
        mockMvc.perform(get("/api/orders/" + user1OrderId)
                        .header("Authorization", "Bearer " + token2))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    private String checkoutJson() throws Exception {
        var quote=mockMvc.perform(get("/api/cart").header("Authorization","Bearer "+token1)).andReturn().getResponse().getContentAsString();
        var mapper=new ObjectMapper();
        return mapper.writeValueAsString(java.util.Map.of("paymentMethod","COD","idempotencyKey",java.util.UUID.randomUUID().toString(),"cartFingerprint",mapper.readTree(quote).get("fingerprint").asText(),"recipientName","Customer","deliveryAddress","123 Test Street","deliveryPhone","9876543210"));
    }
}
