package com.quickkart.product.controller;

import com.quickkart.product.service.ProductImageStorage;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/** Public read access to uploaded product photos. Names are random UUIDs, so they can be cached forever. */
@RestController
@RequestMapping("/api/products/images")
public class ProductImageController {

    private final ProductImageStorage images;

    public ProductImageController(ProductImageStorage images) {
        this.images = images;
    }

    @GetMapping("/{name}")
    public ResponseEntity<FileSystemResource> image(@PathVariable String name) {
        return images.find(name)
                .map(img -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(img.contentType()))
                        .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                        .header("X-Content-Type-Options", "nosniff")
                        .body(new FileSystemResource(img.path())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
