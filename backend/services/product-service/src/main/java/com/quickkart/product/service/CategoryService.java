package com.quickkart.product.service;

import com.quickkart.product.dto.CategoryCount;
import com.quickkart.product.dto.CategoryRequest;
import com.quickkart.product.dto.CategoryResponse;
import com.quickkart.product.entity.Category;
import com.quickkart.product.repository.CategoryRepository;
import com.quickkart.product.repository.ProductRepository;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/** Admin-managed categories. Products keep the category name, so renames are applied to them too. */
@Service
public class CategoryService {

    private final CategoryRepository categories;
    private final ProductRepository products;
    private final ProductService productService;

    public CategoryService(CategoryRepository categories, ProductRepository products, ProductService productService) {
        this.categories = categories;
        this.products = products;
        this.productService = productService;
    }

    /** Storefront list: active categories with their number of on-sale products. */
    @Transactional(readOnly = true)
    public List<CategoryResponse> listActive() {
        Map<String, Long> counts = counts();
        return categories.findByActiveTrueOrderBySortOrderAscNameAsc().stream()
                .map(c -> CategoryResponse.from(c, counts.getOrDefault(key(c.getName()), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CategoryResponse> listAll() {
        Map<String, Long> counts = counts();
        return categories.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(c -> CategoryResponse.from(c, counts.getOrDefault(key(c.getName()), 0L)))
                .toList();
    }

    @Transactional
    @CacheEvict(cacheNames = {ProductService.SEARCH_CACHE, ProductService.CATEGORY_CACHE}, allEntries = true)
    public CategoryResponse create(CategoryRequest request) {
        String name = clean(request.name());
        if (categories.findByNameIgnoreCase(name).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A category named \"" + name + "\" already exists");
        }
        Category category = new Category(name, blankToNull(request.description()), blankToNull(request.imageUrl()),
                request.sortOrder() != null ? request.sortOrder() : nextSortOrder());
        if (request.active() != null) category.setActive(request.active());
        return CategoryResponse.from(categories.save(category), 0);
    }

    @Transactional
    @CacheEvict(cacheNames = {ProductService.SEARCH_CACHE, ProductService.CATEGORY_CACHE}, allEntries = true)
    public CategoryResponse update(Long id, CategoryRequest request) {
        Category category = find(id);
        String name = clean(request.name());
        categories.findByNameIgnoreCase(name).filter(other -> !other.getId().equals(id)).ifPresent(other -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A category named \"" + name + "\" already exists");
        });
        if (!category.getName().equals(name)) {
            products.renameCategory(category.getName(), name); // keep products in the renamed category
            category.setName(name);
        }
        category.setDescription(blankToNull(request.description()));
        category.setImageUrl(blankToNull(request.imageUrl()));
        if (request.sortOrder() != null) category.setSortOrder(request.sortOrder());
        if (request.active() != null) category.setActive(request.active());
        return CategoryResponse.from(category, products.countByCategoryIgnoreCase(name));
    }

    @Transactional
    @CacheEvict(cacheNames = {ProductService.SEARCH_CACHE, ProductService.CATEGORY_CACHE}, allEntries = true)
    public void delete(Long id) {
        Category category = find(id);
        long inUse = products.countByCategoryIgnoreCase(category.getName());
        if (inUse > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "\"" + category.getName() + "\" still has " + inUse
                    + " product(s). Move them to another category or hide the category instead.");
        }
        categories.delete(category);
    }

    /** Returns the canonical category name for a product, or rejects an unknown one. */
    @Transactional(readOnly = true)
    public String canonicalName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Category is required");
        }
        return categories.findByNameIgnoreCase(name.trim()).map(Category::getName)
                .orElseThrow(() -> new IllegalArgumentException("Unknown category \"" + name.trim() + "\". Create it under Categories first."));
    }

    private Category find(Long id) {
        return categories.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found"));
    }

    private Map<String, Long> counts() {
        return productService.categories().stream().collect(Collectors.toMap(CategoryCount::getCategory, CategoryCount::getCount, Long::sum));
    }

    private int nextSortOrder() {
        return categories.findAll().stream().mapToInt(Category::getSortOrder).max().orElse(0) + 10;
    }

    private static String key(String name) {
        return name.toUpperCase(Locale.ROOT);
    }

    private static String clean(String name) {
        return name.trim().replaceAll("\\s+", " ");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
