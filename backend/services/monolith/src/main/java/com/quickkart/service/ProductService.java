package com.quickkart.service;

import com.quickkart.dto.ProductRequest;
import com.quickkart.dto.ProductResponse;
import com.quickkart.entity.Product;
import com.quickkart.exception.ResourceNotFoundException;
import com.quickkart.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Service
public class ProductService {

    private static final Logger log = LoggerFactory.getLogger(ProductService.class);

    private final ProductRepository productRepository;
    private final AtomicLong productDbLoadCount = new AtomicLong(0);

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        log.info("DATABASE WRITE - Evicting product list cache on creating new product: {}", request.getName());
        Product product = new Product(
                request.getName(),
                request.getBrand(),
                request.getDescription(),
                request.getPrice(),
                request.getDiscountPercentage() != null ? request.getDiscountPercentage() : 0.0,
                request.getRating() != null ? request.getRating() : 4.0,
                request.getReviewCount() != null ? request.getReviewCount() : 0,
                request.getStockQuantity(),
                request.getCategory(),
                request.getSku(),
                request.getImageUrl(),
                request.getThumbnailUrl(),
                request.getAvailability() != null ? request.getAvailability() : "IN_STOCK"
        );
        Product savedProduct = productRepository.save(product);
        return ProductResponse.fromEntity(savedProduct);
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> getAllProducts() {
        log.info("DATABASE READ - Fetching all products from PostgreSQL database");
        return productRepository.findAll()
                .stream()
                .map(ProductResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id) {
        productDbLoadCount.incrementAndGet();
        log.info("DATABASE READ - Fetching product from PostgreSQL database for id: {} (Total DB queries: {})", id, productDbLoadCount.get());
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));
        return ProductResponse.fromEntity(product);
    }

    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        log.info("DATABASE WRITE - Evicting cache for product id: {} and product list cache on update", id);
        Product product = productRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));

        product.setName(request.getName());
        if (request.getBrand() != null) product.setBrand(request.getBrand());
        product.setDescription(request.getDescription());
        product.setPrice(request.getPrice());
        if (request.getDiscountPercentage() != null) product.setDiscountPercentage(request.getDiscountPercentage());
        if (request.getRating() != null) product.setRating(request.getRating());
        if (request.getReviewCount() != null) product.setReviewCount(request.getReviewCount());
        product.setStockQuantity(request.getStockQuantity());
        product.setCategory(request.getCategory());
        if (request.getSku() != null) product.setSku(request.getSku());
        product.setImageUrl(request.getImageUrl());
        if (request.getThumbnailUrl() != null) product.setThumbnailUrl(request.getThumbnailUrl());
        if (request.getAvailability() != null) product.setAvailability(request.getAvailability());

        Product updatedProduct = productRepository.save(product);
        return ProductResponse.fromEntity(updatedProduct);
    }

    @Transactional
    public void deleteProduct(Long id) {
        log.info("DATABASE WRITE - Evicting cache for product id: {} and product list cache on delete", id);
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));
        productRepository.delete(product);
    }

    public void evictProductCache(Long id) {
        log.info("DATABASE WRITE - Explicitly evicting cache for product id: {} and product list cache", id);
    }

    public long getProductDbLoadCount() {
        return productDbLoadCount.get();
    }

    public void resetProductDbLoadCount() {
        productDbLoadCount.set(0);
        log.info("RESET - Product DB load counter reset to 0");
    }
}
