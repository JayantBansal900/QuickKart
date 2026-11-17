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
    private final com.quickkart.product.repository.StockMovementRepository stockMovements;
    private final com.quickkart.product.repository.CategoryRepository categoryRepository;

    public ProductService(ProductRepository productRepository,
                          com.quickkart.product.repository.StockMovementRepository stockMovements,
                          com.quickkart.product.repository.CategoryRepository categoryRepository) {
        this.productRepository = productRepository;
        this.stockMovements = stockMovements;
        this.categoryRepository = categoryRepository;
    }

    /** Admin catalog: every product (including discontinued), searchable, filterable by category and stock level. */
    @Transactional(readOnly = true)
    public PageResponse<ProductResponse> searchForAdmin(String q, String category, String stock, String sort, int page, int size) {
        String query = q == null ? "" : q.trim().toLowerCase(java.util.Locale.ROOT);
        String cat = category == null || category.isBlank() || "ALL".equalsIgnoreCase(category) ? null : category.trim().toUpperCase(java.util.Locale.ROOT);
        String level = stock == null ? "ALL" : stock.trim().toUpperCase(java.util.Locale.ROOT);
        org.springframework.data.jpa.domain.Specification<Product> spec = (root, cq, cb) -> {
            java.util.List<jakarta.persistence.criteria.Predicate> where = new java.util.ArrayList<>();
            if (cat != null) where.add(cb.equal(cb.upper(root.get("category")), cat));
            if ("LOW".equals(level)) where.add(cb.lessThan(root.get("stockQuantity"), LOW_STOCK_THRESHOLD));
            if ("OUT".equals(level)) where.add(cb.lessThanOrEqualTo(root.get("stockQuantity"), 0));
            if (!query.isEmpty()) {
                String like = "%" + com.quickkart.product.repository.ProductSpecifications.escapeLike(query) + "%";
                java.util.List<jakarta.persistence.criteria.Predicate> any = new java.util.ArrayList<>(java.util.List.of(
                        cb.like(cb.lower(root.get("name")), like, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.get("brand"), "")), like, '\\'),
                        cb.like(cb.lower(cb.coalesce(root.get("sku"), "")), like, '\\')));
                if (query.matches("\\d{1,18}")) any.add(cb.equal(root.get("id"), Long.parseLong(query)));
                where.add(cb.or(any.toArray(jakarta.persistence.criteria.Predicate[]::new)));
            }
            return cb.and(where.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        org.springframework.data.domain.Sort order = "stock".equalsIgnoreCase(sort)
                ? org.springframework.data.domain.Sort.by("stockQuantity", "id")
                : org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.DESC, "id");
        return PageResponse.from(productRepository.findAll(spec,
                org.springframework.data.domain.PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100), order)),
                ProductResponse::fromEntity);
    }

    /** Products below this many units count as "low stock" in the admin panel. */
    public static final int LOW_STOCK_THRESHOLD = 5;

    @Transactional(readOnly = true)
    public PageResponse<com.quickkart.product.dto.StockMovementResponse> stockHistory(Long productId, int page, int size) {
        if (!productRepository.existsById(productId)) throw new ProductNotFoundException(productId);
        return PageResponse.from(stockMovements.findByProductIdOrderByIdDesc(productId,
                org.springframework.data.domain.PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100))),
                com.quickkart.product.dto.StockMovementResponse::from);
    }

    private void recordStock(Product product, int change, String reason, String actor) {
        if (change != 0) {
            stockMovements.save(new com.quickkart.product.entity.StockMovement(product.getId(), change,
                    product.getStockQuantity(), reason, null, actor));
        }
    }

    /** Products must belong to a known category; the stored name is the category's canonical spelling. */
    private String canonicalCategory(String name) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Category is required");
        return categoryRepository.findByNameIgnoreCase(name.trim()).map(com.quickkart.product.entity.Category::getName)
                .orElseThrow(() -> new IllegalArgumentException("Unknown category \"" + name.trim() + "\". Create it under Categories first."));
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
        return createProduct(request, "ADMIN");
    }

    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public ProductResponse createProduct(ProductRequest request, String actor) {
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
                canonicalCategory(request.getCategory()),
                request.getSku(),
                request.getImageUrl(),
                request.getThumbnailUrl(),
                request.getAvailability() != null ? request.getAvailability() : "IN_STOCK"
        );
        Product saved = productRepository.save(product);
        recordStock(saved, saved.getStockQuantity(), "INITIAL_STOCK", actor);
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
        return updateProduct(id, request, "ADMIN");
    }

    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public ProductResponse updateProduct(Long id, ProductRequest request, String actor) {
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
        int stockChange = request.getStockQuantity() - product.getStockQuantity();
        product.setStockQuantity(request.getStockQuantity());
        product.setCategory(canonicalCategory(request.getCategory()));
        if (request.getSku() != null) product.setSku(request.getSku());
        product.setImageUrl(request.getImageUrl());
        if (request.getThumbnailUrl() != null) product.setThumbnailUrl(request.getThumbnailUrl());
        if (request.getAvailability() != null) product.setAvailability(request.getAvailability());

        Product updated = productRepository.save(product);
        recordStock(updated, stockChange, "ADMIN_EDIT", actor);
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
        return updateStock(id, quantityChange, "ADMIN");
    }

    @Transactional
    @CacheEvict(cacheNames = {SEARCH_CACHE, CATEGORY_CACHE}, allEntries = true)
    public ProductResponse updateStock(Long id, int quantityChange, String actor) {
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
        recordStock(updated, quantityChange, quantityChange > 0 ? "RESTOCK" : "CORRECTION", actor);
        return ProductResponse.fromEntity(updated);
    }
}
