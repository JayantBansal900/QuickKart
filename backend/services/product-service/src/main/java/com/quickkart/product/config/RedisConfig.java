package com.quickkart.product.config;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.BasicPolymorphicTypeValidator;
import com.fasterxml.jackson.databind.jsontype.PolymorphicTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.quickkart.product.service.ProductService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;

/**
 * Redis-backed cache manager for the catalog browse path (see ProductService for the design).
 * Not active in the "test" profile, where an in-memory cache is used instead.
 */
@Profile("!test")
@Configuration
public class RedisConfig {

    /** How stale a cached listing may get when stock changes outside this service (checkout). */
    @Value("${app.cache.search-ttl-seconds:60}")
    private long searchTtlSeconds;

    @Value("${app.cache.category-ttl-seconds:300}")
    private long categoryTtlSeconds;

    /**
     * JSON with embedded type names, restricted to OUR packages and safe JDK value types.
     * The previous LaissezFaire validator accepted ANY class name found in Redis, which is a
     * known Jackson deserialization-gadget risk if an attacker can ever write to Redis.
     */
    static ObjectMapper redisObjectMapper() {
        PolymorphicTypeValidator allowed = BasicPolymorphicTypeValidator.builder()
                .allowIfSubType("com.quickkart.product.dto.")
                .allowIfSubType("java.util.ArrayList")
                .allowIfSubType("java.util.LinkedHashMap")
                .allowIfSubType("java.math.BigDecimal")
                .allowIfSubType("java.lang.")
                .allowIfSubType("java.time.")
                .build();
        ObjectMapper mapper = new ObjectMapper();
        mapper.registerModule(new JavaTimeModule());
        mapper.activateDefaultTyping(allowed, ObjectMapper.DefaultTyping.NON_FINAL, JsonTypeInfo.As.PROPERTY);
        return mapper;
    }

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration base = RedisCacheConfiguration.defaultCacheConfig()
                .disableCachingNullValues()
                .prefixCacheNameWith("quickkart:")
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(
                        new GenericJackson2JsonRedisSerializer(redisObjectMapper())));

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(base.entryTtl(Duration.ofSeconds(searchTtlSeconds)))
                .withCacheConfiguration(ProductService.SEARCH_CACHE, base.entryTtl(Duration.ofSeconds(searchTtlSeconds)))
                .withCacheConfiguration(ProductService.CATEGORY_CACHE, base.entryTtl(Duration.ofSeconds(categoryTtlSeconds)))
                // Evictions happen AFTER the database transaction commits, so a concurrent reader
                // can't re-cache the old value in the gap between "evicted" and "committed".
                .transactionAware()
                .build();
    }
}
