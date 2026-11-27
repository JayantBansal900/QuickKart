package com.quickkart.service;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.ListOffsetsResult;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.PartitionInfo;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.apache.kafka.common.serialization.ByteArrayDeserializer;
import org.apache.kafka.common.serialization.ByteArraySerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Admin troubleshooting for each dependency shown on the System Status page: a few numbers that
 * explain what is going on, the problems found, what to do about them, and the fixes that are safe
 * to run from the browser. Like {@link SystemStatusService}, it never returns credentials and masks
 * host:port pairs in error texts.
 */
@Service
public class SystemDiagnosticsService {

    private static final Logger log = LoggerFactory.getLogger(SystemDiagnosticsService.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(3);
    private static final Pattern HOST_PORT = Pattern.compile("[A-Za-z0-9._-]+:\\d{2,5}");
    /** Consumer group that remembers which dead-letter records were already replayed. */
    static final String REPLAY_GROUP = "quickkart-dlt-replay";
    /** Product listings cached by product-service (see its RedisConfig: prefix "quickkart:"). */
    static final String PRODUCT_CACHE_PATTERN = "quickkart:product*";

    public record Fact(String label, String value) {}

    public record Action(String id, String label, String description) {}

    public record ComponentDetail(String key, String name, String status, long latencyMs,
                                  List<Fact> facts, List<String> problems, List<String> advice,
                                  List<Action> actions, Instant checkedAt) {}

    public record ActionResult(String component, String action, String message, Instant ranAt) {}

    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;
    private final String kafkaBootstrap;
    private final String orderEventsTopic;
    private final String consumerGroup;
    private final String productServiceUrl;
    private final String orderServiceUrl;
    private final RestClient http;

    public SystemDiagnosticsService(JdbcTemplate jdbc,
                                    StringRedisTemplate redis,
                                    @Value("${spring.kafka.bootstrap-servers:localhost:9092}") String kafkaBootstrap,
                                    @Value("${app.kafka.topics.order-events:quickkart.order-events}") String orderEventsTopic,
                                    @Value("${spring.kafka.consumer.group-id:quickkart-order-notifications}") String consumerGroup,
                                    @Value("${app.services.product-url:http://localhost:8082}") String productServiceUrl,
                                    @Value("${app.services.order-url:http://localhost:8083}") String orderServiceUrl) {
        this.jdbc = jdbc;
        this.redis = redis;
        this.kafkaBootstrap = kafkaBootstrap;
        this.orderEventsTopic = orderEventsTopic;
        this.consumerGroup = consumerGroup;
        this.productServiceUrl = productServiceUrl;
        this.orderServiceUrl = orderServiceUrl;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(TIMEOUT);
        factory.setReadTimeout(TIMEOUT);
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    public ComponentDetail details(String key) {
        return switch (key) {
            case "postgres" -> postgres();
            case "redis" -> redisDetails();
            case "kafka" -> kafka();
            case "product-service" -> service("product-service", "Product Service", productServiceUrl, "quickkart-product-service");
            case "order-service" -> service("order-service", "Order Service", orderServiceUrl, "quickkart-order-service");
            case "outbox" -> outbox();
            default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown component");
        };
    }

    public ActionResult run(String key, String action, String admin) {
        String message = switch (key + "/" + action) {
            case "redis/clear-product-cache" -> clearProductCache();
            case "kafka/replay-dead-letters" -> replayDeadLetters();
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This action is not available for this component");
        };
        log.info("System action {}/{} run by {}: {}", key, action, admin, message);
        return new ActionResult(key, action, message, Instant.now());
    }

    // ------------------------------------------------------------------ PostgreSQL

    private ComponentDetail postgres() {
        long start = System.nanoTime();
        List<Fact> facts = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        String status = "UP";
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            optional(facts, "Version", () -> {
                String v = jdbc.queryForObject("SELECT version()", String.class);
                return v == null ? "?" : v.split(",")[0].replace(" on ", " ").trim();
            });
            optional(facts, "Database size", () -> jdbc.queryForObject("SELECT pg_size_pretty(pg_database_size(current_database()))", String.class));
            optional(facts, "Open connections", () -> String.valueOf(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()", Long.class)));
            optional(facts, "Schema version (Flyway)", () -> "V" + jdbc.queryForObject(
                    "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1", String.class));
            optional(facts, "Products on sale", () -> String.valueOf(jdbc.queryForObject(
                    "SELECT COUNT(*) FROM products WHERE availability IS NULL OR UPPER(availability) <> 'DISCONTINUED'", Long.class)));
            optional(facts, "Orders", () -> String.valueOf(jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class)));
            optional(facts, "Accounts", () -> String.valueOf(jdbc.queryForObject("SELECT COUNT(*) FROM users", Long.class)));
        } catch (RuntimeException ex) {
            status = "DOWN";
            problems.add("The database did not answer a simple query.");
        }
        List<String> advice = "UP".equals(status)
                ? List.of("Nothing to do. Backups: docker exec quickkart-postgres sh -c 'pg_dump -U \"$POSTGRES_USER\" \"$POSTGRES_DB\"' > backup.sql")
                : List.of("Check the container: docker compose ps postgres",
                          "Start it again: docker compose up -d --wait postgres",
                          "Read its log: docker logs --tail 50 quickkart-postgres");
        return new ComponentDetail("postgres", "PostgreSQL", status, elapsed(start), facts, problems, advice, List.of(), Instant.now());
    }

    // ------------------------------------------------------------------ Redis

    private ComponentDetail redisDetails() {
        long start = System.nanoTime();
        List<Fact> facts = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        String status = "UP";
        try (RedisConnection connection = redis.getRequiredConnectionFactory().getConnection()) {
            if (!"PONG".equalsIgnoreCase(connection.ping())) throw new IllegalStateException();
            Properties memory = connection.serverCommands().info("memory");
            Properties stats = connection.serverCommands().info("stats");
            facts.add(new Fact("Memory used", memory == null ? "?" : memory.getProperty("used_memory_human", "?")));
            Long keys = connection.serverCommands().dbSize();
            facts.add(new Fact("Keys stored", String.valueOf(keys == null ? 0 : keys)));
            facts.add(new Fact("Cached product pages", String.valueOf(countKeys(PRODUCT_CACHE_PATTERN))));
            long hits = number(stats, "keyspace_hits"), misses = number(stats, "keyspace_misses");
            facts.add(new Fact("Cache hit rate", hits + misses == 0 ? "no reads yet" : Math.round(100.0 * hits / (hits + misses)) + "% (" + hits + " hits, " + misses + " misses)"));
        } catch (RuntimeException ex) {
            status = "DOWN";
            problems.add("Redis did not answer PING. The store still works (product pages come straight from the database), only slower.");
        }
        List<String> advice = "UP".equals(status)
                ? List.of("If the store shows an old price or stock after a change made outside the admin panel, clear the product cache below. The next visit rebuilds it from the database.")
                : List.of("Start it again: docker compose up -d --wait redis",
                          "Read its log: docker logs --tail 50 quickkart-redis");
        List<Action> actions = "UP".equals(status)
                ? List.of(new Action("clear-product-cache", "Clear product cache",
                        "Deletes only the cached product listings and category counts. Nothing else is touched; the next request reloads them from PostgreSQL."))
                : List.of();
        return new ComponentDetail("redis", "Redis", status, elapsed(start), facts, problems, advice, actions, Instant.now());
    }

    private long countKeys(String pattern) {
        long n = 0;
        try (Cursor<String> cursor = redis.scan(ScanOptions.scanOptions().match(pattern).count(500).build())) {
            while (cursor.hasNext()) { cursor.next(); n++; }
        }
        return n;
    }

    private String clearProductCache() {
        List<String> keys = new ArrayList<>();
        try (Cursor<String> cursor = redis.scan(ScanOptions.scanOptions().match(PRODUCT_CACHE_PATTERN).count(500).build())) {
            while (cursor.hasNext()) keys.add(cursor.next());
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Redis is not reachable, so there is no cache to clear.");
        }
        long deleted = keys.isEmpty() ? 0 : redis.delete(keys);
        return deleted == 0 ? "The product cache was already empty." : "Cleared " + deleted + " cached product page(s). They will be rebuilt on the next visit.";
    }

    // ------------------------------------------------------------------ Kafka

    private String deadLetterTopic() {
        return orderEventsTopic + ".DLT";
    }

    private Properties kafkaProps() {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBootstrap);
        props.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, (int) TIMEOUT.toMillis());
        props.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, (int) TIMEOUT.toMillis());
        return props;
    }

    private ComponentDetail kafka() {
        long start = System.nanoTime();
        List<Fact> facts = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        List<Action> actions = new ArrayList<>();
        String status = "UP";
        try (AdminClient admin = AdminClient.create(kafkaProps())) {
            int brokers = admin.describeCluster().nodes().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS).size();
            Set<String> topics = admin.listTopics().names().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            facts.add(new Fact("Brokers", String.valueOf(brokers)));
            facts.add(new Fact("Topics", String.valueOf(topics.size())));
            if (topics.contains(orderEventsTopic)) {
                long total = endOffsets(admin, orderEventsTopic).values().stream().mapToLong(Long::longValue).sum();
                long lag = lag(admin, orderEventsTopic, consumerGroup);
                facts.add(new Fact("Order events sent", String.valueOf(total)));
                facts.add(new Fact("Waiting to be emailed (consumer lag)", String.valueOf(lag)));
                if (lag > 20) problems.add(lag + " order events are waiting for the email service (monolith). It may be stopped or slow.");
            } else {
                facts.add(new Fact("Order events topic", "not created yet (no order placed)"));
            }
            long dead = topics.contains(deadLetterTopic()) ? lag(admin, deadLetterTopic(), REPLAY_GROUP) : 0;
            facts.add(new Fact("Failed events (dead-letter, not replayed)", String.valueOf(dead)));
            if (dead > 0) {
                problems.add(dead + " order event(s) could not be processed and were parked in the dead-letter topic, so those customers may have missed an email.");
                actions.add(new Action("replay-dead-letters", "Replay failed events",
                        "Sends the parked events through the email service again. Safe to repeat: each event is processed at most once (idempotent consumer)."));
            }
        } catch (Exception ex) {
            status = "DOWN";
            problems.add("The Kafka broker is unreachable. Orders still go through: their events wait in the outbox and are sent when Kafka is back.");
        }
        List<String> advice = "UP".equals(status)
                ? List.of("Events flow: order-service → outbox table → Kafka → monolith (emails). A growing lag means the monolith is not reading; check its log: docker logs --tail 50 quickkart-monolith")
                : List.of("Start it again: docker compose up -d --wait kafka",
                          "Read its log: docker logs --tail 50 quickkart-kafka");
        return new ComponentDetail("kafka", "Kafka", status, elapsed(start), facts, problems, advice, actions, Instant.now());
    }

    private Map<TopicPartition, Long> endOffsets(AdminClient admin, String topic) throws Exception {
        return offsets(admin, topic, OffsetSpec.latest());
    }

    private Map<TopicPartition, Long> offsets(AdminClient admin, String topic, OffsetSpec spec) throws Exception {
        var description = admin.describeTopics(List.of(topic)).allTopicNames().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS).get(topic);
        Map<TopicPartition, OffsetSpec> request = new HashMap<>();
        description.partitions().forEach(p -> request.put(new TopicPartition(topic, p.partition()), spec));
        Map<TopicPartition, Long> result = new HashMap<>();
        for (Map.Entry<TopicPartition, ListOffsetsResult.ListOffsetsResultInfo> e
                : admin.listOffsets(request).all().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS).entrySet()) {
            result.put(e.getKey(), e.getValue().offset());
        }
        return result;
    }

    /** Records in {@code topic} that {@code group} has not read yet. */
    private long lag(AdminClient admin, String topic, String group) throws Exception {
        Map<TopicPartition, Long> end = endOffsets(admin, topic);
        Map<TopicPartition, Long> begin = offsets(admin, topic, OffsetSpec.earliest());
        Map<TopicPartition, OffsetAndMetadata> committed = admin.listConsumerGroupOffsets(group)
                .partitionsToOffsetAndMetadata().get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        long lag = 0;
        for (Map.Entry<TopicPartition, Long> e : end.entrySet()) {
            OffsetAndMetadata at = committed.get(e.getKey());
            long from = at == null ? begin.getOrDefault(e.getKey(), 0L) : at.offset();
            lag += Math.max(0, e.getValue() - from);
        }
        return lag;
    }

    /**
     * Re-sends the dead-letter records to the order-events topic, then remembers how far it got
     * (consumer group {@value #REPLAY_GROUP}). The email consumer skips events it already handled.
     */
    private String replayDeadLetters() {
        Properties consumerProps = kafkaProps();
        consumerProps.put(ConsumerConfig.GROUP_ID_CONFIG, REPLAY_GROUP);
        consumerProps.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        consumerProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        consumerProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class.getName());
        consumerProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, ByteArrayDeserializer.class.getName());
        Properties producerProps = kafkaProps();
        producerProps.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class.getName());
        producerProps.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, ByteArraySerializer.class.getName());
        producerProps.put(ProducerConfig.ACKS_CONFIG, "all");
        int replayed = 0;
        try (KafkaConsumer<byte[], byte[]> consumer = new KafkaConsumer<>(consumerProps);
             KafkaProducer<byte[], byte[]> producer = new KafkaProducer<>(producerProps)) {
            List<PartitionInfo> partitions = consumer.partitionsFor(deadLetterTopic(), TIMEOUT);
            if (partitions == null || partitions.isEmpty()) return "There are no failed events to replay.";
            List<TopicPartition> assigned = partitions.stream().map(p -> new TopicPartition(p.topic(), p.partition())).toList();
            consumer.assign(assigned);
            Map<TopicPartition, OffsetAndMetadata> committed = consumer.committed(new HashSet<>(assigned), TIMEOUT);
            for (TopicPartition tp : assigned) {
                OffsetAndMetadata at = committed.get(tp);
                if (at == null) consumer.seekToBeginning(List.of(tp)); else consumer.seek(tp, at.offset());
            }
            Map<TopicPartition, Long> end = consumer.endOffsets(assigned, TIMEOUT);
            long deadline = System.currentTimeMillis() + 10_000;
            while (System.currentTimeMillis() < deadline && assigned.stream().anyMatch(tp -> consumer.position(tp, TIMEOUT) < end.get(tp))) {
                ConsumerRecords<byte[], byte[]> batch = consumer.poll(Duration.ofMillis(500));
                for (ConsumerRecord<byte[], byte[]> record : batch) {
                    RecordHeaders headers = new RecordHeaders();
                    for (Header h : record.headers()) {
                        if (!h.key().startsWith("kafka_dlt")) headers.add(h); // keep the type headers, drop the failure details
                    }
                    producer.send(new ProducerRecord<>(orderEventsTopic, null, record.key(), record.value(), headers));
                    replayed++;
                }
                producer.flush();
                Map<TopicPartition, OffsetAndMetadata> done = new LinkedHashMap<>();
                for (TopicPartition tp : assigned) done.put(tp, new OffsetAndMetadata(consumer.position(tp, TIMEOUT)));
                consumer.commitSync(done, TIMEOUT);
            }
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Kafka is not reachable, so the failed events could not be replayed.");
        }
        return replayed == 0 ? "There were no failed events to replay." : "Replayed " + replayed + " failed event(s). Customers get any email they missed.";
    }

    // ------------------------------------------------------------------ product / order service

    @SuppressWarnings("unchecked")
    private ComponentDetail service(String key, String name, String baseUrl, String container) {
        long start = System.nanoTime();
        List<Fact> facts = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        String status;
        try {
            Map<String, Object> body = http.get().uri(baseUrl + "/actuator/health").retrieve().body(Map.class);
            status = body != null && "UP".equals(body.get("status")) ? "UP" : "DOWN";
            facts.add(new Fact("Health", body == null ? "no answer" : String.valueOf(body.get("status"))));
            Object components = body == null ? null : body.get("components");
            if (components instanceof Map<?, ?> parts) {
                for (Map.Entry<?, ?> part : parts.entrySet()) {
                    Object partStatus = part.getValue() instanceof Map<?, ?> m ? m.get("status") : null;
                    if (partStatus != null) {
                        facts.add(new Fact("  " + readable(String.valueOf(part.getKey())), String.valueOf(partStatus)));
                        if (!"UP".equals(partStatus) && !"UNKNOWN".equals(partStatus))
                            problems.add(name + " reports its " + readable(String.valueOf(part.getKey())) + " as " + partStatus + ".");
                    }
                }
            }
        } catch (RuntimeException ex) {
            status = "DOWN";
            problems.add(name + " did not answer its health check.");
        }
        if ("DOWN".equals(status) && problems.isEmpty()) problems.add(name + " is running but not healthy.");
        List<String> advice = "UP".equals(status)
                ? List.of("Nothing to do. Its log: docker logs --tail 50 " + container)
                : List.of("Start it again: docker compose up -d --wait " + key,
                          "Read its log for the cause: docker logs --tail 80 " + container,
                          "After changing its Java code: build the jar (mvn -q package -DskipTests in backend/services/" + key + "), then docker compose up -d --build --wait " + key);
        return new ComponentDetail(key, name, status, elapsed(start), facts, problems, advice, List.of(), Instant.now());
    }

    private static String readable(String key) {
        return switch (key) {
            case "db" -> "database";
            case "diskSpace" -> "disk space";
            case "redis" -> "Redis";
            case "kafka" -> "Kafka";
            case "ping" -> "ping";
            default -> key;
        };
    }

    // ------------------------------------------------------------------ outbox

    private ComponentDetail outbox() {
        long start = System.nanoTime();
        List<Fact> facts = new ArrayList<>();
        List<String> problems = new ArrayList<>();
        String status = "UP";
        try {
            long pending = count("SELECT COUNT(*) FROM outbox_events WHERE published_at IS NULL");
            long stale = count("SELECT COUNT(*) FROM outbox_events WHERE published_at IS NULL AND created_at < ?",
                    Timestamp.valueOf(LocalDateTime.now().minusMinutes(2)));
            long failing = count("SELECT COUNT(*) FROM outbox_events WHERE published_at IS NULL AND attempts > 0");
            long lastDay = count("SELECT COUNT(*) FROM outbox_events WHERE published_at > ?",
                    Timestamp.valueOf(LocalDateTime.now().minusDays(1)));
            facts.add(new Fact("Waiting to be sent", String.valueOf(pending)));
            facts.add(new Fact("Waiting over 2 minutes", String.valueOf(stale)));
            facts.add(new Fact("Failed at least once", String.valueOf(failing)));
            facts.add(new Fact("Sent in the last 24 hours", String.valueOf(lastDay)));
            if (pending > 0) {
                Timestamp oldest = jdbc.queryForObject("SELECT MIN(created_at) FROM outbox_events WHERE published_at IS NULL", Timestamp.class);
                if (oldest != null) facts.add(new Fact("Oldest waiting", Duration.between(oldest.toLocalDateTime(), LocalDateTime.now()).toMinutes() + " min"));
            }
            if (stale > 0) {
                status = "DOWN";
                problems.add(stale + " order event(s) have waited more than 2 minutes. Kafka is probably down, or order-service (which sends them) is stopped.");
            }
            jdbc.query("SELECT event_id, topic, attempts, last_error FROM outbox_events WHERE published_at IS NULL AND attempts > 0 ORDER BY id LIMIT 5",
                    rs -> {
                        problems.add("Event " + rs.getString("event_id") + " (" + rs.getString("topic") + "): " + rs.getInt("attempts")
                                + " failed attempt(s)" + (rs.getString("last_error") == null ? "" : ". Last error: " + clean(rs.getString("last_error"))));
                    });
        } catch (RuntimeException ex) {
            status = "DOWN";
            problems.add("The outbox table could not be read.");
        }
        List<String> advice = "UP".equals(status)
                ? List.of("Every order writes its event here in the same transaction as the order, so no event is lost. order-service sends them to Kafka every second, oldest first.")
                : List.of("The relay in order-service retries by itself every second; nothing is lost. Fix the cause and the waiting events go out in order:",
                          "1. Open the Kafka card on this page: if Kafka is DOWN, start it (docker compose up -d --wait kafka).",
                          "2. Open the Order Service card: if it is DOWN, start it (docker compose up -d --wait order-service).",
                          "3. Press \"Check again\" here: the waiting count should drop to 0 within a few seconds.");
        return new ComponentDetail("outbox", "Order events (outbox)", status, elapsed(start), facts, problems, advice, List.of(), Instant.now());
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    // ------------------------------------------------------------------ helpers

    /** Error texts may contain internal host:port pairs; those are masked before they reach the browser. */
    static String clean(String text) {
        String masked = HOST_PORT.matcher(text).replaceAll("<host>");
        return masked.length() > 160 ? masked.substring(0, 160) + "…" : masked;
    }

    private interface Reader { String read(); }

    private static void optional(List<Fact> facts, String label, Reader reader) {
        try {
            facts.add(new Fact(label, reader.read()));
        } catch (RuntimeException ignored) {
            // Not available on this database (for example the H2 test database): leave the fact out.
        }
    }

    private static long number(Properties props, String key) {
        try {
            return props == null ? 0 : Long.parseLong(props.getProperty(key, "0").trim());
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private static long elapsed(long start) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    }
}
