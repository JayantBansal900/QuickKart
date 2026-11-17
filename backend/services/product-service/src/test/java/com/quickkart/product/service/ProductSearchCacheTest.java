package com.quickkart.product.service;

import com.quickkart.product.dto.ProductRequest;
import com.quickkart.product.entity.Product;
import com.quickkart.product.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Proves the caching contract with an in-memory cache (same Spring cache annotations as Redis):
 *  - repeated identical searches are served from cache,
 *  - any write through product-service evicts cached searches,
 *  - single-product reads are never cached (always live stock).
 */
@SpringBootTest
class ProductSearchCacheTest {

    @Autowired ProductService service;
    @Autowired ProductRepository products;
    @Autowired CacheManager cacheManager;
    @Autowired com.quickkart.product.repository.CategoryRepository categories;

    private static final String CAT = "CACHETEST";
    private Product product;

    @BeforeEach
    void setUp() {
        if (categories.findByNameIgnoreCase(CAT).isEmpty()) categories.save(new com.quickkart.product.entity.Category(CAT, null, null, 999));
        products.deleteAll(products.findAll().stream().filter(p -> CAT.equals(p.getCategory())).toList());
        product = products.saveAndFlush(new Product("Cache Kettle", "d", new BigDecimal("50.00"), 10, CAT));
        cacheManager.getCacheNames().forEach(name -> cacheManager.getCache(name).clear());
    }

    private ProductSearchCriteria criteria() {
        return ProductSearchCriteria.of(null, CAT, null, null, null, 0, 24);
    }

    @Test
    void identicalSearchIsServedFromCacheAndEquivalentInputSharesTheKey() {
        var first = service.search(criteria());
        // A write that bypasses product-service (like order-service's checkout) is not seen...
        product.setStockQuantity(3);
        products.saveAndFlush(product);
        var second = service.search(ProductSearchCriteria.of("  ", " cachetest ", null, null, "FEATURED", 0, 24));
        assertEquals(10, second.getContent().get(0).getStockQuantity(), "expected cached (bounded-staleness) result");
        assertEquals(first.getTotalElements(), second.getTotalElements());
        // ...but the product page reads live data.
        assertEquals(3, service.getProductById(product.getId()).getStockQuantity());
    }

    @Test
    void writesThroughProductServiceEvictCachedSearches() {
        service.search(criteria());
        service.updateStock(product.getId(), 5);
        assertEquals(15, service.search(criteria()).getContent().get(0).getStockQuantity());

        ProductRequest rename = new ProductRequest();
        rename.setName("Renamed Kettle");
        rename.setDescription("d");
        rename.setPrice(new BigDecimal("55.00"));
        rename.setStockQuantity(15);
        rename.setCategory(CAT);
        service.updateProduct(product.getId(), rename);
        assertEquals("Renamed Kettle", service.search(criteria()).getContent().get(0).getName());
    }

    @Test
    void categoryCountsAreEvictedOnCreate() {
        long before = service.categories().stream().filter(c -> CAT.equals(c.getCategory())).findFirst().orElseThrow().getCount();
        ProductRequest request = new ProductRequest();
        request.setName("Second Kettle");
        request.setDescription("d");
        request.setPrice(new BigDecimal("12.00"));
        request.setStockQuantity(1);
        request.setCategory(CAT);
        service.createProduct(request);
        long after = service.categories().stream().filter(c -> CAT.equals(c.getCategory())).findFirst().orElseThrow().getCount();
        assertEquals(before + 1, after);
    }
}
