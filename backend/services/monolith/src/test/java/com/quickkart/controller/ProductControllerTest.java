package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.ProductRequest;
import com.quickkart.dto.ProductResponse;
import com.quickkart.exception.ResourceNotFoundException;
import com.quickkart.service.ProductService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ProductController.class)
@AutoConfigureMockMvc(addFilters = false)
class ProductControllerTest {
    @org.springframework.boot.test.mock.mockito.MockBean private com.quickkart.security.AccountAccessService accounts;
    @org.springframework.boot.test.mock.mockito.MockBean private com.quickkart.security.AuthRateLimiter authLimits;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ProductService productService;

    @MockBean
    private com.quickkart.security.JwtService jwtService;

    @Test
    void shouldCreateProductSuccessfully() throws Exception {
        ProductRequest request = new ProductRequest(
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("79999.00"),
                20,
                "Electronics"
        );

        ProductResponse response = new ProductResponse(
                1L,
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("79999.00"),
                20,
                "Electronics"
        );

        when(productService.createProduct(any(ProductRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1L))
                .andExpect(jsonPath("$.name").value("iPhone 16"))
                .andExpect(jsonPath("$.price").value(79999.00))
                .andExpect(jsonPath("$.stockQuantity").value(20));
    }

    @Test
    void shouldRejectProductWithBlankName() throws Exception {
        ProductRequest request = new ProductRequest(
                "",
                "Apple smartphone",
                new BigDecimal("79999.00"),
                20,
                "Electronics"
        );

        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldRejectProductWithNegativePrice() throws Exception {
        ProductRequest request = new ProductRequest(
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("-10.00"),
                20,
                "Electronics"
        );

        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldRejectProductWithNegativeStock() throws Exception {
        ProductRequest request = new ProductRequest(
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("100.00"),
                -5,
                "Electronics"
        );

        mockMvc.perform(post("/api/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldGetAllProducts() throws Exception {
        ProductResponse response = new ProductResponse(
                1L,
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("79999.00"),
                20,
                "Electronics"
        );

        when(productService.getAllProducts()).thenReturn(List.of(response));

        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1L))
                .andExpect(jsonPath("$[0].name").value("iPhone 16"));
    }

    @Test
    void shouldGetProductById() throws Exception {
        ProductResponse response = new ProductResponse(
                1L,
                "iPhone 16",
                "Apple smartphone",
                new BigDecimal("79999.00"),
                20,
                "Electronics"
        );

        when(productService.getProductById(1L)).thenReturn(response);

        mockMvc.perform(get("/api/products/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1L))
                .andExpect(jsonPath("$.name").value("iPhone 16"));
    }

    @Test
    void shouldReturn404WhenProductNotFound() throws Exception {
        when(productService.getProductById(999L))
                .thenThrow(new ResourceNotFoundException("Product not found with id: 999"));

        mockMvc.perform(get("/api/products/999"))
                .andExpect(status().isNotFound());
    }
}
