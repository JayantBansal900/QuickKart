package com.quickkart.product.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Configuration;

/**
 * Enables Spring's cache abstraction in every profile (Redis in dev/prod, in-memory in tests).
 *
 * The error handler makes the cache OPTIONAL: if Redis is down or a cached entry can't be read,
 * we log a warning and fall through to PostgreSQL instead of failing the customer's request.
 */
@Configuration
@EnableCaching
public class CacheConfig implements CachingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(CacheConfig.class);

    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            @Override
            public void handleCacheGetError(RuntimeException ex, Cache cache, Object key) {
                log.warn("Cache read failed for {} — serving from database ({})", cache.getName(), ex.getClass().getSimpleName());
                safeEvict(cache, key);
            }

            @Override
            public void handleCachePutError(RuntimeException ex, Cache cache, Object key, Object value) {
                log.warn("Cache write failed for {} ({})", cache.getName(), ex.getClass().getSimpleName());
            }

            @Override
            public void handleCacheEvictError(RuntimeException ex, Cache cache, Object key) {
                log.warn("Cache evict failed for {} — entries expire by TTL ({})", cache.getName(), ex.getClass().getSimpleName());
            }

            @Override
            public void handleCacheClearError(RuntimeException ex, Cache cache) {
                log.warn("Cache clear failed for {} — entries expire by TTL ({})", cache.getName(), ex.getClass().getSimpleName());
            }
        };
    }

    private static void safeEvict(Cache cache, Object key) {
        try {
            cache.evict(key); // drop an unreadable entry so the next request can re-cache it
        } catch (RuntimeException ignored) {
            // Redis unavailable; nothing more to do.
        }
    }
}
