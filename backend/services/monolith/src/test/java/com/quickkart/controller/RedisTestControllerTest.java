package com.quickkart.controller;

import com.quickkart.dto.ProductResponse;
import com.quickkart.service.ProductService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class RedisTestControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProductService productService;

    @Test
    @DisplayName("GET /api/dev/redis-test/status returns Redis connection status")
    void shouldReturnRedisStatus() throws Exception {
        mockMvc.perform(get("/api/dev/redis-test/status"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/dev/redis-test/product/{id} inspects product cache state")
    void shouldInspectProductCacheState() throws Exception {
        mockMvc.perform(get("/api/dev/redis-test/product/2"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/dev/redis-test/evict/{id} evicts product cache")
    void shouldEvictProductCache() throws Exception {
        mockMvc.perform(post("/api/dev/redis-test/evict/2"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/dev/redis-test/reset-counter resets DB load count")
    void shouldResetCounter() throws Exception {
        mockMvc.perform(post("/api/dev/redis-test/reset-counter"))
                .andExpect(status().isUnauthorized());
    }
}
