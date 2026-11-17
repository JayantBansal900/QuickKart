package com.quickkart.product.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.product.entity.Product;
import com.quickkart.product.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@org.springframework.context.annotation.Profile("dev & !prod")
@Component
public class DevProductInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DevProductInitializer.class);

    private final ProductRepository productRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.dev-products.enabled:false}")
    private boolean devProductsEnabled;

    public DevProductInitializer(ProductRepository productRepository, ObjectMapper objectMapper) {
        this.productRepository = productRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(String... args) {
        if (!devProductsEnabled) {
            log.info("Development product seed initializer is disabled.");
            return;
        }

        try {
            ClassPathResource resource = new ClassPathResource("catalog.json");
            if (!resource.exists()) {
                log.warn("catalog.json not found on classpath. Skipping catalog import.");
                return;
            }

            log.info("Loading rich QuickKart product catalog dataset in product-service from catalog.json...");
            InputStream inputStream = resource.getInputStream();
            List<Map<String, Object>> items = objectMapper.readValue(inputStream, new TypeReference<List<Map<String, Object>>>() {});

            int importedCount = 0;
            int updatedCount = 0;

            for (Map<String, Object> item : items) {
                String sku = (String) item.get("sku");
                String name = (String) item.get("name");
                String brand = (String) item.get("brand");
                String description = (String) item.get("description");
                String category = (String) item.get("category");
                String imageUrl = (String) item.get("imageUrl");
                String thumbnailUrl = (String) item.get("thumbnailUrl");
                String availability = (String) item.getOrDefault("availability", "IN_STOCK");

                BigDecimal price = new BigDecimal(item.get("price").toString());
                Double discountPercentage = item.get("discountPercentage") != null ? Double.parseDouble(item.get("discountPercentage").toString()) : 0.0;
                Double rating = item.get("rating") != null ? Double.parseDouble(item.get("rating").toString()) : 4.0;
                Integer reviewCount = item.get("reviewCount") != null ? Integer.parseInt(item.get("reviewCount").toString()) : 0;
                Integer stockQuantity = item.get("stockQuantity") != null ? Integer.parseInt(item.get("stockQuantity").toString()) : 50;

                Optional<Product> existingOpt = sku != null ? productRepository.findBySku(sku) : Optional.empty();

                if (existingOpt.isPresent()) {
                    // Existing catalog data is authoritative. Never reset prices or inventory.
                    continue;
                } else {
                    Product product = new Product(
                            name, brand, description, price, discountPercentage, rating, reviewCount,
                            stockQuantity, category, sku, imageUrl, thumbnailUrl, availability
                    );
                    productRepository.save(product);
                    importedCount++;
                }
            }

            log.info("[product-service] Catalog seed finished: {} new products created, {} existing products updated by SKU.", importedCount, updatedCount);

        } catch (Exception e) {
            log.error("Failed to seed product catalog from catalog.json", e);
        }
    }
}
