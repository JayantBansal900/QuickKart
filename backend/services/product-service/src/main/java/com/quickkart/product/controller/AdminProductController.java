package com.quickkart.product.controller;

import com.quickkart.product.dto.ProductRequest;
import com.quickkart.product.dto.ProductResponse;
import com.quickkart.product.dto.StockAdjustmentRequest;
import org.springframework.web.bind.annotation.PatchMapping;
import com.quickkart.product.service.ProductImageStorage;
import com.quickkart.product.service.ProductService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/products")
public class AdminProductController {

    private final ProductService productService;
    private final ProductImageStorage images;

    public AdminProductController(ProductService productService, ProductImageStorage images) {
        this.productService = productService;
        this.images = images;
    }

    /** Upload a product photo (JPEG/PNG/WebP, max 3 MB). Replaces the current image. */
    @PostMapping(path = "/{id}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ProductResponse> uploadImage(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws IOException {
        String url = images.save(file.getBytes());
        ProductService.ImageChange change;
        try {
            change = productService.setImage(id, url);
        } catch (RuntimeException e) {
            images.deleteIfUploaded(url); // don't leave an orphan file if the product update failed
            throw e;
        }
        images.deleteIfUploaded(change.previousUrl());
        return ResponseEntity.ok(change.product());
    }

    @GetMapping
    public ResponseEntity<List<ProductResponse>> getAllProductsForAdmin() {
        return ResponseEntity.ok(productService.getAllProducts());
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
        ProductResponse updated = productService.updateProduct(id, request);
        return ResponseEntity.ok(updated);
    }

    /** Inventory: restock (+n) or correct (-n) stock atomically under a row lock. */
    @PatchMapping("/{id}/stock")
    public ResponseEntity<ProductResponse> adjustStock(
            @PathVariable Long id,
            @Valid @RequestBody StockAdjustmentRequest request) {
        if (request.getAdjustment() == 0) {
            throw new IllegalArgumentException("Adjustment must not be zero");
        }
        return ResponseEntity.ok(productService.updateStock(id, request.getAdjustment()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProduct(@PathVariable Long id) {
        String image = productService.getProductById(id).getImageUrl();
        productService.deleteProduct(id);
        images.deleteIfUploaded(image); // only after the delete committed; catalog artwork is never touched
        return ResponseEntity.noContent().build();
    }
}
