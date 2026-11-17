package com.quickkart.product.controller;

import com.quickkart.product.entity.Product;
import com.quickkart.product.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ProductSearchIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ProductRepository products;
    @Autowired CacheManager cacheManager;

    private static final String CAT = "SEARCHTEST";

    private Product product(String name, String brand, String price, Double rating, String description) {
        Product p = new Product(name, description, new BigDecimal(price), 5, CAT);
        p.setBrand(brand);
        p.setRating(rating);
        return p;
    }

    @BeforeEach
    void seed() {
        products.deleteAll(products.findAll().stream().filter(p -> CAT.equals(p.getCategory())).toList());
        products.saveAllAndFlush(java.util.List.of(
                product("Alpha Phone", "Zeta", "300.00", 4.5, "smart phone"),
                product("Beta Laptop", "Acme", "900.00", 3.9, "fast laptop"),
                product("Gamma Phone Case", "Acme", "20.00", null, "case for phone"),
                product("Delta 50% Sale Mug", "Mugs", "10.00", 4.9, "ceramic")
        ));
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    }

    @Test
    void searchesNameBrandAndDescriptionCaseInsensitively() throws Exception {
        mvc.perform(get("/api/products").param("category", CAT).param("q", "PHONE").param("sort", "name"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[*].name", contains("Alpha Phone", "Gamma Phone Case")));
        mvc.perform(get("/api/products").param("category", CAT).param("q", "acme"))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void likeWildcardsInSearchTextAreTreatedLiterally() throws Exception {
        mvc.perform(get("/api/products").param("category", CAT).param("q", "50%"))
                .andExpect(jsonPath("$.content[*].name", contains("Delta 50% Sale Mug")));
        mvc.perform(get("/api/products").param("category", CAT).param("q", "%"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void filtersByPriceRangeAndSortsByPrice() throws Exception {
        mvc.perform(get("/api/products").param("category", CAT.toLowerCase())
                        .param("minPrice", "15").param("maxPrice", "900").param("sort", "price-desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].name", contains("Beta Laptop", "Alpha Phone", "Gamma Phone Case")));
    }

    @Test
    void ratingSortPutsUnratedProductsLast() throws Exception {
        mvc.perform(get("/api/products").param("category", CAT).param("sort", "rating-desc"))
                .andExpect(jsonPath("$.content[*].name",
                        contains("Delta 50% Sale Mug", "Alpha Phone", "Beta Laptop", "Gamma Phone Case")));
    }

    @Test
    void ratingSortIsStableAcrossPages() throws Exception {
        mvc.perform(get("/api/products").param("category", CAT).param("sort", "rating-desc").param("size", "2").param("page", "1"))
                .andExpect(jsonPath("$.content[*].name", contains("Beta Laptop", "Gamma Phone Case")))
                .andExpect(jsonPath("$.totalElements").value(4));
    }

    @Test
    void paginatesWithStableOrderingAndMetadata() throws Exception {
        mvc.perform(get("/api/products").param("category", CAT).param("sort", "price-asc").param("size", "3").param("page", "0"))
                .andExpect(jsonPath("$.content", hasSize(3)))
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.last").value(false));
        mvc.perform(get("/api/products").param("category", CAT).param("sort", "price-asc").param("size", "3").param("page", "1"))
                .andExpect(jsonPath("$.content[*].name", contains("Beta Laptop")))
                .andExpect(jsonPath("$.last").value(true));
    }

    @Test
    void defaultRequestIsPagedNotTheWholeCatalog() throws Exception {
        mvc.perform(get("/api/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(24))
                .andExpect(jsonPath("$.page").value(0));
    }

    @Test
    void rejectsInvalidParametersWith400() throws Exception {
        String[][] bad = {
                {"size", "0"}, {"size", "49"}, {"page", "-1"}, {"page", "abc"},
                {"sort", "price; DROP TABLE products"}, {"minPrice", "-1"}, {"minPrice", "cheap"},
                {"q", "x".repeat(101)}
        };
        for (String[] p : bad) {
            mvc.perform(get("/api/products").param(p[0], p[1])).andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/products").param("minPrice", "100").param("maxPrice", "10"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void categoryCountsComeFromOneAggregateQuery() throws Exception {
        mvc.perform(get("/api/products/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.category == '" + CAT + "')].count", contains(4)));
    }

    @Test
    void everyResultMatchesTheCategoryFilter() throws Exception {
        mvc.perform(get("/api/products").param("category", CAT).param("size", "48"))
                .andExpect(jsonPath("$.content[*].category", everyItem(org.hamcrest.Matchers.equalTo(CAT))));
    }
}
