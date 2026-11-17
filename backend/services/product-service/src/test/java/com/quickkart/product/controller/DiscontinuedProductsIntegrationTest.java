package com.quickkart.product.controller;

import com.quickkart.product.entity.Product;
import com.quickkart.product.repository.ProductRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** A DISCONTINUED product leaves the storefront but stays readable by id (old orders link to it). */
@SpringBootTest
@AutoConfigureMockMvc
class DiscontinuedProductsIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ProductRepository products;
    @Autowired CacheManager caches;

    @Test
    void discontinuedProductsAreHiddenFromSearchAndCategoryCountsButStillReadableById() throws Exception {
        caches.getCacheNames().forEach(n -> caches.getCache(n).clear());
        String category = "Retired" + UUID.randomUUID().toString().substring(0, 6);
        String tag = "zq" + UUID.randomUUID().toString().substring(0, 8);
        Product live = new Product("Live " + tag, "d", new BigDecimal("10.00"), 5, category);
        Product gone = new Product("Gone " + tag, "d", new BigDecimal("10.00"), 5, category);
        gone.setAvailability("DISCONTINUED");
        products.save(live);
        gone = products.save(gone);

        mvc.perform(get("/api/products").param("q", tag))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[*].name", not(hasItem("Gone " + tag))));
        mvc.perform(get("/api/products/categories"))
                .andExpect(jsonPath("$[?(@.category == '" + category.toUpperCase() + "')].count").value(hasItem(1)));
        mvc.perform(get("/api/products/{id}", gone.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.availability").value("DISCONTINUED"));
    }
}
