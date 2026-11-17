package com.quickkart.product.config;

import com.quickkart.product.dto.CategoryCount;
import com.quickkart.product.dto.PageResponse;
import com.quickkart.product.dto.ProductResponse;
import com.quickkart.product.entity.Product;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.SerializationException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Exercises the exact serializer used for Redis, without needing a Redis server. */
class RedisSerializationTest {

    private final GenericJackson2JsonRedisSerializer serializer =
            new GenericJackson2JsonRedisSerializer(RedisConfig.redisObjectMapper());

    @Test
    void searchPageRoundTripsWithTypesIntact() {
        Product p = new Product("Kettle", "d", new BigDecimal("49.90"), 3, "HOME");
        p.setId(7L);
        PageResponse<ProductResponse> page = PageResponse.from(
                new PageImpl<>(List.of(p), PageRequest.of(0, 24), 1), ProductResponse::fromEntity);

        Object back = serializer.deserialize(serializer.serialize(page));

        PageResponse<?> restored = assertInstanceOf(PageResponse.class, back);
        ProductResponse item = assertInstanceOf(ProductResponse.class, restored.getContent().get(0));
        assertEquals(new BigDecimal("49.90"), item.getPrice());
        assertEquals(1, restored.getTotalElements());
    }

    @Test
    void categoryListRoundTrips() {
        ArrayList<CategoryCount> counts = new ArrayList<>(List.of(new CategoryCount("HOME", 3)));
        List<?> back = assertInstanceOf(List.class, serializer.deserialize(serializer.serialize(counts)));
        assertEquals(3, assertInstanceOf(CategoryCount.class, back.get(0)).getCount());
    }

    @Test
    void refusesToInstantiateArbitraryClassesFromCache() {
        // A poisoned cache entry naming a class outside the allow-list must not be instantiated.
        String poisoned = "{\"@class\":\"java.net.URL\",\"protocol\":\"http\",\"host\":\"example.invalid\"}";
        assertThrows(SerializationException.class,
                () -> serializer.deserialize(poisoned.getBytes(StandardCharsets.UTF_8)));
    }
}
