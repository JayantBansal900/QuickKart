package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.AddCartItemRequest;
import com.quickkart.dto.UpdateCartItemRequest;
import com.quickkart.entity.Cart;
import com.quickkart.entity.CartItem;
import com.quickkart.entity.Product;
import com.quickkart.entity.User;
import com.quickkart.repository.CartItemRepository;
import com.quickkart.repository.CartRepository;
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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CartIntegrationTest {

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
    private JwtService jwtService;

    private User testUser;
    private String jwtToken;
    private Product testProduct;

    @BeforeEach
    void setUp() {
        cartItemRepository.deleteAll();
        cartRepository.deleteAll();

        testUser = userRepository.findByEmail("cartuser@example.com")
                .orElseGet(() -> userRepository.save(new User("Cart User", "cartuser@example.com", "password", "USER")));

        testUser.setEmailVerified(true); testUser.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(testUser);

        jwtToken = jwtService.generateToken(testUser);

        testProduct = productRepository.save(new Product(
                "Wireless Headphones",
                "Noise Cancelling",
                new BigDecimal("150.00"),
                10,
                "Audio"
        ));
    }

    @Test
    void unauthenticatedRequestToCart_ShouldReturn401() throws Exception {
        mockMvc.perform(get("/api/cart"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(post("/api/cart/items")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"productId\":1,\"quantity\":1}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getCart_ShouldReturnEmptyCartInitially() throws Exception {
        mockMvc.perform(get("/api/cart")
                        .header("Authorization", "Bearer " + jwtToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cartId").exists())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalAmount").value(0));
    }

    @Test
    void addProductToCart_ShouldSucceed() throws Exception {
        AddCartItemRequest request = new AddCartItemRequest(testProduct.getId(), 2);

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].productId").value(testProduct.getId()))
                .andExpect(jsonPath("$.items[0].quantity").value(2))
                .andExpect(jsonPath("$.items[0].price").value(150.00))
                .andExpect(jsonPath("$.items[0].subtotal").value(300.00))
                .andExpect(jsonPath("$.totalAmount").value(300.00));
    }

    @Test
    void addSameProductToCart_ShouldIncreaseQuantityInsteadOfDuplicate() throws Exception {
        AddCartItemRequest request1 = new AddCartItemRequest(testProduct.getId(), 2);
        AddCartItemRequest request2 = new AddCartItemRequest(testProduct.getId(), 3);

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request1)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].quantity").value(5))
                .andExpect(jsonPath("$.items[0].subtotal").value(750.00))
                .andExpect(jsonPath("$.totalAmount").value(750.00));
    }

    @Test
    void addProductToCart_ShouldRejectWhenExceedsStock() throws Exception {
        AddCartItemRequest request = new AddCartItemRequest(testProduct.getId(), 99);

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.error").value("Insufficient Stock"));
    }

    @Test
    void addProductToCart_ShouldRejectInvalidQuantity() throws Exception {
        AddCartItemRequest request = new AddCartItemRequest(testProduct.getId(), 0);

        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.validationErrors.quantity").exists());
    }

    @Test
    void updateCartItemQuantity_ShouldSucceed() throws Exception {
        // First add product
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(testProduct.getId(), 2))))
                .andExpect(status().isOk());

        // Update quantity to 4
        UpdateCartItemRequest updateRequest = new UpdateCartItemRequest(4);
        mockMvc.perform(put("/api/cart/items/" + testProduct.getId())
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].quantity").value(4))
                .andExpect(jsonPath("$.items[0].subtotal").value(600.00));
    }

    @Test
    void removeItemFromCart_ShouldSucceed() throws Exception {
        // First add product
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(testProduct.getId(), 2))))
                .andExpect(status().isOk());

        // Delete item
        mockMvc.perform(delete("/api/cart/items/" + testProduct.getId())
                        .header("Authorization", "Bearer " + jwtToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalAmount").value(0));
    }

    @Test
    void clearCart_ShouldRemoveAllItems() throws Exception {
        // Add item
        mockMvc.perform(post("/api/cart/items")
                        .header("Authorization", "Bearer " + jwtToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new AddCartItemRequest(testProduct.getId(), 2))))
                .andExpect(status().isOk());

        // Clear cart
        mockMvc.perform(delete("/api/cart")
                        .header("Authorization", "Bearer " + jwtToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)))
                .andExpect(jsonPath("$.totalAmount").value(0));
    }
}
