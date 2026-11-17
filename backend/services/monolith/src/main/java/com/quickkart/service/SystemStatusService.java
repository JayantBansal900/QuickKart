package com.quickkart.service;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.DescribeClusterOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Callable;

/**
 * Admin-only operational snapshot. Each dependency is probed with a short timeout and reported
 * as UP/DOWN with latency. Deliberately returns NO hostnames, credentials or exception messages:
 * only a fixed, safe description of what failed.
 */
@Service
public class SystemStatusService {

    public record ComponentStatus(String name, String status, long latencyMs, String detail) {}

    public record SystemStatus(String overall, Instant checkedAt, List<ComponentStatus> components) {}

    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;
    private final String kafkaBootstrap;
    private final RestClient http;
    private final String productServiceUrl;
    private final String orderServiceUrl;

    public SystemStatusService(JdbcTemplate jdbc,
                               StringRedisTemplate redis,
                               @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String kafkaBootstrap,
                               @Value("${app.services.product-url:http://localhost:8082}") String productServiceUrl,
                               @Value("${app.services.order-url:http://localhost:8083}") String orderServiceUrl) {
        this.jdbc = jdbc;
        this.redis = redis;
        this.kafkaBootstrap = kafkaBootstrap;
        this.productServiceUrl = productServiceUrl;
        this.orderServiceUrl = orderServiceUrl;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(TIMEOUT);
        factory.setReadTimeout(TIMEOUT);
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    public SystemStatus check() {
        List<ComponentStatus> components = List.of(
                probe("PostgreSQL", "Database query failed", () -> jdbc.queryForObject("SELECT 1", Integer.class)),
                probe("Redis", "Cache did not answer PING", this::pingRedis),
                probe("Kafka", "Broker unreachable", this::describeKafka),
                probe("Product Service", "Health endpoint not UP", () -> serviceHealth(productServiceUrl)),
                probe("Order Service", "Health endpoint not UP", () -> serviceHealth(orderServiceUrl))
        );
        boolean allUp = components.stream().allMatch(c -> "UP".equals(c.status()));
        return new SystemStatus(allUp ? "UP" : "DEGRADED", Instant.now(), components);
    }

    private ComponentStatus probe(String name, String failure, Callable<?> check) {
        long start = System.nanoTime();
        try {
            check.call();
            return new ComponentStatus(name, "UP", elapsedMs(start), "Healthy");
        } catch (Exception ex) {
            return new ComponentStatus(name, "DOWN", elapsedMs(start), failure);
        }
    }

    private static long elapsedMs(long start) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    }

    private Object pingRedis() {
        try (RedisConnection connection = redis.getRequiredConnectionFactory().getConnection()) {
            String pong = connection.ping();
            if (!"PONG".equalsIgnoreCase(pong)) throw new IllegalStateException();
            return pong;
        }
    }

    private Object describeKafka() throws Exception {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBootstrap);
        props.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, (int) TIMEOUT.toMillis());
        props.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, (int) TIMEOUT.toMillis());
        try (AdminClient admin = AdminClient.create(props)) {
            int nodes = admin.describeCluster(new DescribeClusterOptions().timeoutMs((int) TIMEOUT.toMillis()))
                    .nodes().get(TIMEOUT.toMillis() + 500, TimeUnit.MILLISECONDS).size();
            if (nodes == 0) throw new IllegalStateException();
            return nodes;
        }
    }

    @SuppressWarnings("unchecked")
    private Object serviceHealth(String baseUrl) {
        Map<String, Object> body = http.get().uri(baseUrl + "/actuator/health").retrieve().body(Map.class);
        if (body == null || !"UP".equals(body.get("status"))) throw new IllegalStateException();
        return body.get("status");
    }
}
