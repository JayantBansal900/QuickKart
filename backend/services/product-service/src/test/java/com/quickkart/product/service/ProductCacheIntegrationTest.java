package com.quickkart.product.service;
import com.quickkart.product.entity.Product;
import com.quickkart.product.repository.ProductRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest
class ProductCacheIntegrationTest {
 @Autowired ProductService service; @Autowired ProductRepository products;
 @Test void externalInventoryAndPriceWritesAreVisibleOnNextRead() {
  var product=products.saveAndFlush(new Product("Fresh product","Isolated test",new BigDecimal("10.00"),4,"Test"));
  assertEquals(4,service.getProductById(product.getId()).getStockQuantity());
  service.getAllProducts();
  // Simulates the other service committing inventory/price changes to the shared table.
  product.setStockQuantity(0);product.setPrice(new BigDecimal("15.00"));products.saveAndFlush(product);
  assertEquals(0,service.getProductById(product.getId()).getStockQuantity());
  assertEquals(new BigDecimal("15.00"),service.getProductById(product.getId()).getPrice());
  var listed=service.getAllProducts().stream().filter(p->p.getId().equals(product.getId())).findFirst().orElseThrow();
  assertEquals(0,listed.getStockQuantity());assertEquals(new BigDecimal("15.00"),listed.getPrice());
 }
}
