package com.quickkart.product.service;

import com.quickkart.product.dto.CategoryCount;
import com.quickkart.product.dto.PageResponse;
import com.quickkart.product.dto.ProductRequest;
import com.quickkart.product.dto.ProductResponse;
import com.quickkart.product.entity.Product;
import com.quickkart.product.exception.ProductInUseException;
import com.quickkart.product.exception.ProductNotFoundException;
import org.springframework.dao.DataIntegrityViolationException;
import com.quickkart.product.repository.ProductRepository;
import com.quickkart.product.repository.ProductSpecifications;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ProductService {

    private static final Logger log = LoggerFactory.getLogger(ProductService.class);

    /** Browse/search result pages. Short TTL: see the class comment on caching below. */
    public static final String SEARCH_CACHE = "productSearch";
    public static final String CATEGORY_CACHE = "productCategories";

    /*
     * Caching design (bounded staleness):
     *  - Only the read-heavy BROWSE path (search pages, category counts) is cached in Redis.
     *  - Single-product reads (getProductById) and the admin full list are NOT cached, so the
     *    product page and admin screens always show live stock and price.
     *  - Order-service decrements stock directly in the shared database, so it cannot evict this
     *    cache; a short TTL bounds how stale a listing's stock badge can be. That is safe because
     *    checkout re-reads every product under a pessimistic row lock — a stale listing can never
     *    cause an oversell.
     *  - Every write made through THIS service evicts both caches immediately.
     */
    private final ProductRepository productRepository;

    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> getAllProducts() {
        log.info("[ProductService] Database read: Fetching all products from PostgreSQL");
        return productRepository.findAll().stream()
                .map(ProductResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = SEARCH_CACHE, key = "#criteria.cacheKey()")
    public PageResponse<ProductResponse> search(ProductSearchCriteria criteria) {
        log.debug("[ProductService] Catalog search (cache miss): {}", criteria.cacheKey());
        return PageResponse.from(
                productRepository.findAll(ProductSpecifications.matching(criteria), criteria.pageable()),
                ProductResponse::fromEntity);
    }

    @Transactional(readOnly = true)
    @Cacheable(cacheNames = CATEGORY_CACHE, key = "'all'")
    public List<CategoryCount> categories() {
        return new java.util.ArrayList<>(productRepository.countByCategory());
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id) {
        log.info("[ProductService] Reading current product id={} from PostgreSQL", id);
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ProductNotFoundException(id));
        return ProductResponse.fromEntity(product);
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> getProductsByCategory(String category) {
        log.info("[ProductService] Fetching products by category: {}", category);
        return productRepository.findByCategoryIgnoreCase(category).stream()
                .map(ProductResponse::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public ProductResponse createProduct(ProductRequest request) {
        log.info("[ProductService] Creating product '{}' and evicting productList cache", request.getName());
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
        Product saved = productRepository.save(product);
        return ProductResponse.fromEntity(saved);
    }

    /** Points the product at a newly uploaded photo and returns the URL it replaced. */
    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public ImageChange setImage(Long id, String imageUrl) {
        Product product = productRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ProductNotFoundException(id));
        String previous = product.getImageUrl();
        product.setImageUrl(imageUrl);
        product.setThumbnailUrl(imageUrl);
        return new ImageChange(ProductResponse.fromEntity(productRepository.save(product)), previous);
    }

    public record ImageChange(ProductResponse product, String previousUrl) {}

    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        log.info("[ProductService] Updating product id={} and evicting cache for id and productList", id);
        Product product = productRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ProductNotFoundException(id));

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

        Product updated = productRepository.save(product);
        return ProductResponse.fromEntity(updated);
    }

    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public void deleteProduct(Long id) {
        log.info("[ProductService] Deleting product id={} and evicting cache for id and productList", id);
        if (!productRepository.existsById(id)) {
            throw new ProductNotFoundException(id);
        }
        try {
            productRepository.deleteById(id);
            // Flush now so a foreign-key violation (order_items / cart_items) surfaces here as a
            // clear 409 instead of an opaque 500 at commit time.
            productRepository.flush();
        } catch (DataIntegrityViolationException ex) {
            throw new ProductInUseException(id);
        }
    }

    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public ProductResponse updateStock(Long id, int quantityChange) {
        log.info("[ProductService] Updating stock for product id={} (change={})", id, quantityChange);
        Product product = productRepository.findByIdForUpdate(id)
                .orElseThrow(() -> new ProductNotFoundException(id));

        int newQuantity = Math.addExact(product.getStockQuantity(), quantityChange);
        if (newQuantity < 0) {
            throw new IllegalArgumentException("Insufficient stock for product id: " + id + ". Available: " + product.getStockQuantity());
        }

        product.setStockQuantity(newQuantity);
        // Keep the storefront badge consistent with real stock. DISCONTINUED is a deliberate
        // admin choice and is never flipped automatically.
        if (newQuantity > 0 && "OUT_OF_STOCK".equalsIgnoreCase(product.getAvailability())) {
            product.setAvailability("IN_STOCK");
        } else if (newQuantity == 0 && "IN_STOCK".equalsIgnoreCase(product.getAvailability())) {
            product.setAvailability("OUT_OF_STOCK");
        }
        Product updated = productRepository.save(product);
        return ProductResponse.fromEntity(updated);
    }
}
