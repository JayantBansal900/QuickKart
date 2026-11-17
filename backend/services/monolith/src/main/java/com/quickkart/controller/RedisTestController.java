package com.quickkart.controller;

import com.quickkart.service.ProductService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * DEV/TEST ONLY CONTROLLER
 * Provides safe, targeted inspection and eviction endpoints specifically for the
 * Redis Cache Testing Sandbox tab in local development environments.
 *
 * NOTE: Strictly restricted to product cache key inspection and testing.
 * Does NOT accept arbitrary commands or manipulate arbitrary data.
 */
@org.springframework.context.annotation.Profile("dev & !prod")
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "app.dev-tools.enabled", havingValue = "true")
@RestController
@RequestMapping("/api/dev/redis-test")
public class RedisTestController {

    private static final Logger log = LoggerFactory.getLogger(RedisTestController.class);

    private final ProductService productService;
    private final StringRedisTemplate stringRedisTemplate;

    public RedisTestController(ProductService productService,
                               @Autowired(required = false) StringRedisTemplate stringRedisTemplate) {
        this.productService = productService;
        this.stringRedisTemplate = stringRedisTemplate;
    }

    /**
     * Inspect Redis connection status and cache settings.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getRedisStatus() {
        Map<String, Object> response = new HashMap<>();
        boolean isConnected = false;
        String pingResult = "UNKNOWN";

        try {
            if (stringRedisTemplate != null && stringRedisTemplate.getConnectionFactory() != null) {
                try (RedisConnection connection = stringRedisTemplate.getConnectionFactory().getConnection()) {
                    pingResult = connection.ping();
                    isConnected = "PONG".equalsIgnoreCase(pingResult);
                }
            }
        } catch (Exception e) {
            log.warn("Redis ping failed: {}", e.getMessage());
            pingResult = "FAILED: " + e.getMessage();
        }

        response.put("status", isConnected ? "CONNECTED" : "DISCONNECTED");
        response.put("ping", pingResult);
        response.put("cacheName", "products");
        response.put("keyPattern", "products::{id}");
        response.put("defaultTtlSeconds", 300);
        response.put("dbLoadCount", productService.getProductDbLoadCount());
        response.put("timestamp", System.currentTimeMillis());

        return ResponseEntity.ok(response);
    }

    /**
     * Inspect exact Redis cache state for a given product ID.
     */
    @GetMapping("/product/{id}")
    public ResponseEntity<Map<String, Object>> getProductCacheState(@PathVariable Long id) {
        Map<String, Object> response = new HashMap<>();
        String cacheKey = "products::" + id;
        boolean exists = false;
        Long ttlSeconds = -1L;
        String rawCachedValue = null;

        try {
            if (stringRedisTemplate != null) {
                Boolean hasKey = stringRedisTemplate.hasKey(cacheKey);
                exists = Boolean.TRUE.equals(hasKey);
                if (exists) {
                    ttlSeconds = stringRedisTemplate.getExpire(cacheKey, TimeUnit.SECONDS);
                    rawCachedValue = stringRedisTemplate.opsForValue().get(cacheKey);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to query Redis for key [{}]: {}", cacheKey, e.getMessage());
        }

        response.put("productId", id);
        response.put("key", cacheKey);
        response.put("exists", exists);
        response.put("ttlSeconds", ttlSeconds);
        response.put("cachedValue", rawCachedValue);
        response.put("dbLoadCount", productService.getProductDbLoadCount());

        return ResponseEntity.ok(response);
    }

    /**
     * Explicitly evict cache entry for a given product ID before running Cache MISS test.
     */
    @PostMapping("/evict/{id}")
    public ResponseEntity<Map<String, Object>> evictProductCache(@PathVariable Long id) {
        String cacheKey = "products::" + id;
        log.info("DEV/TEST - Explicitly evicting Redis cache for product id: {}", id);

        productService.evictProductCache(id);

        boolean existsAfter = false;
        try {
            if (stringRedisTemplate != null) {
                existsAfter = Boolean.TRUE.equals(stringRedisTemplate.hasKey(cacheKey));
            }
        } catch (Exception e) {
            log.warn("Failed to check key existence after eviction: {}", e.getMessage());
        }

        Map<String, Object> response = new HashMap<>();
        response.put("productId", id);
        response.put("key", cacheKey);
        response.put("evicted", true);
        response.put("existsAfterEviction", existsAfter);
        response.put("dbLoadCount", productService.getProductDbLoadCount());
        response.put("message", "Cache entry for " + cacheKey + " evicted successfully");

        return ResponseEntity.ok(response);
    }

    /**
     * Reset the database query counter.
     */
    @PostMapping("/reset-counter")
    public ResponseEntity<Map<String, Object>> resetCounter() {
        productService.resetProductDbLoadCount();
        Map<String, Object> response = new HashMap<>();
        response.put("dbLoadCount", 0);
        response.put("message", "Product database query counter reset to 0");
        return ResponseEntity.ok(response);
    }
}
