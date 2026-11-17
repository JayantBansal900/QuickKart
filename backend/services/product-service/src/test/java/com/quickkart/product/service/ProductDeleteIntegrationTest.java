package com.quickkart.product.service;

import com.quickkart.product.entity.Product;
import com.quickkart.product.exception.ProductInUseException;
import com.quickkart.product.repository.ProductRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class ProductDeleteIntegrationTest {

    @Autowired ProductService service;
    @Autowired ProductRepository products;
    @Autowired JdbcTemplate jdbc;

    @AfterEach
    void dropProbe() {
        jdbc.execute("DROP TABLE IF EXISTS order_items_probe");
    }

    @Test
    void deletingAProductReferencedByAnOrderReturnsConflictAndKeepsTheProduct() {
        Product product = products.saveAndFlush(new Product("Ordered item", "desc", new BigDecimal("10.00"), 3, "Test"));
        // order_items lives in order-service; this table reproduces its foreign key to products.
        jdbc.execute("CREATE TABLE order_items_probe (id BIGINT PRIMARY KEY, product_id BIGINT REFERENCES products(id))");
        jdbc.update("INSERT INTO order_items_probe VALUES (1, ?)", product.getId());

        assertThrows(ProductInUseException.class, () -> service.deleteProduct(product.getId()));
        assertTrue(products.existsById(product.getId()));
    }

    @Test
    void deletingAnUnreferencedProductSucceeds() {
        Product product = products.saveAndFlush(new Product("Unused item", "desc", new BigDecimal("5.00"), 1, "Test"));
        service.deleteProduct(product.getId());
        assertFalse(products.existsById(product.getId()));
    }
}
