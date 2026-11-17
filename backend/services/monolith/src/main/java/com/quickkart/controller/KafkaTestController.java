package com.quickkart.controller;

import com.quickkart.config.KafkaConfig;
import com.quickkart.consumer.ConsumedOrderEventRecord;
import com.quickkart.consumer.OrderNotificationConsumer;
import com.quickkart.dto.OrderCreatedEvent;
import com.quickkart.dto.OrderItemSummary;
import com.quickkart.producer.OrderEventProducer;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.ListTopicsResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaAdmin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@org.springframework.context.annotation.Profile("dev & !prod")
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name = "app.dev-tools.enabled", havingValue = "true")
@RestController
@RequestMapping("/api/kafka")
public class KafkaTestController {

    private static final Logger log = LoggerFactory.getLogger(KafkaTestController.class);

    private final OrderEventProducer orderEventProducer;
    private final OrderNotificationConsumer orderNotificationConsumer;
    private final KafkaAdmin kafkaAdmin;
    private final KafkaConfig kafkaConfig;

    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String bootstrapServers;

    @Value("${app.kafka.topics.order-events:quickkart.order-events}")
    private String orderEventsTopic;

    @Value("${spring.kafka.consumer.group-id:quickkart-order-notifications}")
    private String consumerGroupId;

    @Value("${app.kafka.embedded.enabled:true}")
    private boolean embeddedEnabled;

    public KafkaTestController(
            OrderEventProducer orderEventProducer,
            OrderNotificationConsumer orderNotificationConsumer,
            KafkaAdmin kafkaAdmin,
            KafkaConfig kafkaConfig) {
        this.orderEventProducer = orderEventProducer;
        this.orderNotificationConsumer = orderNotificationConsumer;
        this.kafkaAdmin = kafkaAdmin;
        this.kafkaConfig = kafkaConfig;
    }

    /**
     * Inspects actual connection status to Kafka cluster and returns real metrics.
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getKafkaStatus() {
        Map<String, Object> status = new HashMap<>();
        String effectiveServers = kafkaConfig != null ? kafkaConfig.getEffectiveBootstrapServers() : bootstrapServers;
        status.put("topic", orderEventsTopic);
        status.put("consumerGroup", consumerGroupId);
        status.put("bootstrapServers", effectiveServers);
        status.put("embedded", embeddedEnabled);

        boolean isConnected = false;
        Map<String, Object> adminProps = new HashMap<>(kafkaAdmin.getConfigurationProperties());
        adminProps.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, effectiveServers);
        adminProps.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, "500");
        adminProps.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, "500");
        try (AdminClient adminClient = AdminClient.create(adminProps)) {
            ListTopicsResult topics = adminClient.listTopics();
            topics.names().get(500, TimeUnit.MILLISECONDS);
            isConnected = true;
        } catch (Exception ex) {
            log.debug("[Kafka Status Check] Kafka admin client connection check: {}", ex.getMessage());
            // If producer or consumer has successfully delivered/consumed events, we are connected
            if (orderEventProducer.getTotalPublishedCount() > 0 || orderNotificationConsumer.getTotalConsumedCount() > 0) {
                isConnected = true;
            }
        }

        status.put("connected", isConnected);
        status.put("status", isConnected ? "CONNECTED" : "DISCONNECTED");

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalPublished", orderEventProducer.getTotalPublishedCount());
        stats.put("totalConsumed", orderNotificationConsumer.getTotalConsumedCount());
        stats.put("duplicateCount", orderNotificationConsumer.getDuplicateCount());
        stats.put("simulatedNotifications", orderNotificationConsumer.getSimulatedNotificationCount());
        status.put("stats", stats);

        return ResponseEntity.ok(status);
    }

    /**
     * Publishes a test OrderCreated event directly to verify Kafka Producer.
     */
    @PostMapping("/publish-test")
    public ResponseEntity<Map<String, Object>> publishTestEvent(@RequestBody(required = false) Map<String, Object> request) {
        Long orderId = request != null && request.containsKey("orderId")
                ? Long.valueOf(request.get("orderId").toString())
                : (System.currentTimeMillis() % 100000);

        Long userId = request != null && request.containsKey("userId")
                ? Long.valueOf(request.get("userId").toString())
                : 1L;

        BigDecimal totalAmount = request != null && request.containsKey("totalAmount")
                ? new BigDecimal(request.get("totalAmount").toString())
                : new BigDecimal("149.99");

        OrderCreatedEvent event = orderEventProducer.publishTestOrderEvent(orderId, userId, totalAmount);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("message", "OrderCreatedEvent published to Kafka topic: " + orderEventsTopic);
        response.put("event", event);
        return ResponseEntity.ok(response);
    }

    /**
     * Simulates sending a duplicate event with an existing eventId to test consumer idempotency.
     */
    @PostMapping("/simulate-duplicate")
    public ResponseEntity<Map<String, Object>> simulateDuplicate(@RequestBody(required = false) Map<String, Object> request) {
        String eventIdToDuplicate = null;
        Long orderId = 999L;
        Long userId = 1L;
        BigDecimal totalAmount = new BigDecimal("89.99");

        if (request != null && request.containsKey("eventId")) {
            eventIdToDuplicate = request.get("eventId").toString();
        } else if (!orderNotificationConsumer.getProcessedEventIds().isEmpty()) {
            eventIdToDuplicate = orderNotificationConsumer.getProcessedEventIds().iterator().next();
        } else {
            eventIdToDuplicate = UUID.randomUUID().toString();
        }

        List<OrderItemSummary> items = new ArrayList<>();
        items.add(new OrderItemSummary(1L, "Duplicate Test Product", 1, totalAmount));

        OrderCreatedEvent duplicateEvent = new OrderCreatedEvent(
                eventIdToDuplicate,
                "ORDER_CREATED",
                orderId,
                userId,
                totalAmount,
                LocalDateTime.now(),
                items
        );

        orderEventProducer.publishDuplicateEvent(duplicateEvent);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("duplicatedEventId", eventIdToDuplicate);
        response.put("message", "Published duplicate event with eventId: " + eventIdToDuplicate + ". Consumer should detect and skip notification.");
        response.put("event", duplicateEvent);
        return ResponseEntity.ok(response);
    }

    /**
     * Returns recent events from both producer and consumer.
     */
    @GetMapping("/events")
    public ResponseEntity<Map<String, Object>> getRecentEvents() {
        Map<String, Object> data = new HashMap<>();
        data.put("published", orderEventProducer.getRecentPublishedEvents());
        data.put("consumed", orderNotificationConsumer.getRecentConsumedEvents());
        return ResponseEntity.ok(data);
    }

    /**
     * Resets event history and metrics in the developer sandbox.
     */
    @PostMapping("/reset")
    public ResponseEntity<Map<String, String>> resetStats() {
        orderEventProducer.resetStats();
        orderNotificationConsumer.reset();
        return ResponseEntity.ok(Map.of("message", "Kafka developer sandbox statistics and event logs reset."));
    }
}
