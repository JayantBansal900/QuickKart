package com.quickkart.product.controller;

import com.quickkart.product.dto.CategoryCount;
import com.quickkart.product.dto.PageResponse;
import com.quickkart.product.dto.ProductRequest;
import com.quickkart.product.service.ProductSearchCriteria;
import java.math.BigDecimal;
import com.quickkart.product.dto.ProductResponse;
import com.quickkart.product.service.ProductService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    /**
     * Public catalog search. Filtering, sorting and pagination happen in PostgreSQL, so a page
     * request returns at most {@value ProductSearchCriteria#MAX_SIZE} products instead of the
     * whole catalog. Example: GET /api/products?q=phone&category=ELECTRONICS&minPrice=1000&sort=price-asc&page=0&size=24
     */
    @GetMapping
    public ResponseEntity<PageResponse<ProductResponse>> searchProducts(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false, name = "variantSize") String variantSize,
            @RequestParam(required = false, name = "color") String color,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        ProductSearchCriteria criteria = ProductSearchCriteria.of(q, category, minPrice, maxPrice, sort, variantSize, color, page, size);
        return ResponseEntity.ok(productService.search(criteria));
    }

    /** Product count per category for the storefront's department navigation. */
    @GetMapping("/categories")
    public ResponseEntity<List<CategoryCount>> categories() {
        return ResponseEntity.ok(productService.categories());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getProductById(@PathVariable Long id) {
        return ResponseEntity.ok(productService.getProductById(id));
    }

    @PostMapping
    public ResponseEntity<ProductResponse> createProduct(@Valid @RequestBody ProductRequest request) {
        ProductResponse created = productService.createProduct(request);
        return new ResponseEntity<>(created, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ProductResponse> updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(productService.updateProduct(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        productService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }
}
