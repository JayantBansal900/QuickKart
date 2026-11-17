package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.ProductRequest;
import com.quickkart.entity.Product;
import com.quickkart.entity.User;
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
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AdminProductIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtService jwtService;

    private User adminUser;
    private User normalUser;
    private String adminToken;
    private String userToken;
    private Product sampleProduct;

    @BeforeEach
    void setUp() {
        adminUser = userRepository.findByEmail("admin_test@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("Admin User", "admin_test@quickkart.com", "pass123", "ADMIN")));
        normalUser = userRepository.findByEmail("normal_test@quickkart.com")
                .orElseGet(() -> userRepository.save(new User("Normal User", "normal_test@quickkart.com", "pass123", "USER")));

        adminUser.setEmailVerified(true); adminUser.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(adminUser);

        adminToken = jwtService.generateToken(adminUser);
        normalUser.setEmailVerified(true); normalUser.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(normalUser);
        userToken = jwtService.generateToken(normalUser);

        sampleProduct = productRepository.save(new Product("Admin Test Phone", "Latest model", new BigDecimal("799.99"), 20, "Electronics"));
    }

    @Test
    void test8_AdminCanCreateProduct() throws Exception {
        ProductRequest request = new ProductRequest("Smart Watch", "AMOLED display", new BigDecimal("199.99"), 15, "Wearables");

        mockMvc.perform(post("/api/admin/products")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.name").value("Smart Watch"))
                .andExpect(jsonPath("$.price").value(199.99))
                .andExpect(jsonPath("$.stockQuantity").value(15));
    }

    @Test
    void test9_AdminCanUpdateProduct() throws Exception {
        ProductRequest updateRequest = new ProductRequest("Updated Phone Name", "New description", new BigDecimal("849.99"), 25, "Electronics");

        mockMvc.perform(put("/api/admin/products/" + sampleProduct.getId())
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Phone Name"))
                .andExpect(jsonPath("$.price").value(849.99))
                .andExpect(jsonPath("$.stockQuantity").value(25));

        Product updated = productRepository.findById(sampleProduct.getId()).orElseThrow();
        assertEquals("Updated Phone Name", updated.getName());
    }

    @Test
    void test10_AdminCanDeleteProduct() throws Exception {
        Product toDelete = productRepository.save(new Product("Delete Me", "To be deleted", new BigDecimal("10.00"), 5, "Misc"));

        mockMvc.perform(delete("/api/admin/products/" + toDelete.getId())
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isNoContent());

        assertFalse(productRepository.existsById(toDelete.getId()));
    }

    @Test
    void test11_AdminCanViewProducts() throws Exception {
        mockMvc.perform(get("/api/admin/products")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].name").exists());
    }

    @Test
    void test12_UserCannotAccessAdminProductApis() throws Exception {
        ProductRequest request = new ProductRequest("Hacker Laptop", "Should fail", new BigDecimal("999.99"), 1, "Computers");

        // Normal USER receives 403 on POST /api/admin/products
        mockMvc.perform(post("/api/admin/products")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));

        // Normal USER receives 403 on GET /api/admin/products
        mockMvc.perform(get("/api/admin/products")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));

        // Normal USER receives 403 on PUT /api/admin/products/{id}
        mockMvc.perform(put("/api/admin/products/" + sampleProduct.getId())
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));

        // Normal USER receives 403 on DELETE /api/admin/products/{id}
        mockMvc.perform(delete("/api/admin/products/" + sampleProduct.getId())
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void test13_UnauthenticatedUserCannotAccessAdminProductApis() throws Exception {
        ProductRequest request = new ProductRequest("No Auth Product", "Desc", new BigDecimal("50.00"), 5, "General");

        // Unauthenticated receives 401
        mockMvc.perform(post("/api/admin/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(get("/api/admin/products"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(put("/api/admin/products/" + sampleProduct.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(delete("/api/admin/products/" + sampleProduct.getId()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void publicProductEndpoints_RemainPublic() throws Exception {
        // GET /api/products is public without authentication
        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))));

        // GET /api/products/{id} is public without authentication
        mockMvc.perform(get("/api/products/" + sampleProduct.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(sampleProduct.getId()));
    }

    @Test
    void oldPublicProductWriteEndpoints_AreNoLongerPublic() throws Exception {
        ProductRequest request = new ProductRequest("Old Path Product", "Desc", new BigDecimal("50.00"), 5, "General");

        // Unauthenticated write to /api/products -> 401
        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized());

        // Regular USER write to /api/products -> 403
        mockMvc.perform(post("/api/products")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isForbidden());
    }
}
