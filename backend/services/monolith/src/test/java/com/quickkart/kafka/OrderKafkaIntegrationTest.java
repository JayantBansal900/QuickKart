package com.quickkart.kafka;

import com.quickkart.entity.User;
import com.quickkart.repository.ProcessedEventRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.service.EmailService;
import org.mockito.Mockito;
import org.springframework.kafka.test.EmbeddedKafkaBroker;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.quickkart.consumer.ConsumedOrderEventRecord;
import com.quickkart.consumer.OrderNotificationConsumer;
import com.quickkart.dto.OrderCreatedEvent;
import com.quickkart.dto.OrderItemSummary;
import com.quickkart.producer.OrderEventProducer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {"app.kafka.embedded.enabled=false", "spring.kafka.listener.auto-startup=true",
        "spring.kafka.consumer.group-id=monolith-kafka-test-${random.uuid}"})
@EmbeddedKafka(
        partitions = 1,
        topics = {"quickkart.order-events", "quickkart.order-events.DLT"},
        bootstrapServersProperty = "spring.kafka.bootstrap-servers"
)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OrderKafkaIntegrationTest {

    @Autowired
    private OrderEventProducer orderEventProducer;

    @Autowired
    private OrderNotificationConsumer orderNotificationConsumer;

    @Autowired private UserRepository users;
    @Autowired private ProcessedEventRepository processedEvents;
    @Autowired private EmailService emailService; // Mockito mock registered by the test context
    @Autowired private EmbeddedKafkaBroker broker;

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        orderNotificationConsumer.reset();
        orderEventProducer.resetStats();
        Mockito.reset(emailService);
        objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
    }

    @Test
    @DisplayName("1. OrderCreatedEvent creation and stable JSON representation")
    void testOrderCreatedEvent_CreationAndJsonSerialization() throws Exception {
        String eventId = UUID.randomUUID().toString();
        LocalDateTime now = LocalDateTime.of(2026, 9, 7, 12, 0, 0);
        List<OrderItemSummary> items = List.of(
                new OrderItemSummary(101L, "Mechanical Keyboard", 1, new BigDecimal("89.99")),
                new OrderItemSummary(102L, "USB-C Cable", 2, new BigDecimal("12.50"))
        );

        OrderCreatedEvent event = new OrderCreatedEvent(
                eventId,
                "ORDER_CREATED",
                555L,
                12L,
                new BigDecimal("114.99"),
                now,
                items
        );

        // Serialize to JSON
        String json = objectMapper.writeValueAsString(event);
        assertNotNull(json);
        assertTrue(json.contains("\"eventId\":\"" + eventId + "\""));
        assertTrue(json.contains("\"eventType\":\"ORDER_CREATED\""));
        assertTrue(json.contains("\"orderId\":555"));
        assertTrue(json.contains("\"userId\":12"));
        assertTrue(json.contains("\"totalAmount\":114.99"));
        assertTrue(json.contains("Mechanical Keyboard"));

        // Deserialize back
        OrderCreatedEvent deserialized = objectMapper.readValue(json, OrderCreatedEvent.class);
        assertEquals(eventId, deserialized.getEventId());
        assertEquals("ORDER_CREATED", deserialized.getEventType());
        assertEquals(555L, deserialized.getOrderId());
        assertEquals(12L, deserialized.getUserId());
        assertEquals(new BigDecimal("114.99"), deserialized.getTotalAmount());
        assertEquals(2, deserialized.getItems().size());
        assertEquals("Mechanical Keyboard", deserialized.getItems().get(0).getProductName());
    }

    private User customer() {
        return users.saveAndFlush(new User("Kafka Customer", "kafka-" + UUID.randomUUID() + "@example.invalid", "hash", "USER", true, "ACTIVE"));
    }

    private OrderCreatedEvent event(String eventId, Long orderId, Long userId) {
        return new OrderCreatedEvent(eventId, "ORDER_CREATED", orderId, userId, new BigDecimal("2499.00"), LocalDateTime.now(),
                List.of(new OrderItemSummary(1L, "Laptop Pro", 1, new BigDecimal("2499.00"))));
    }

    @Test
    @DisplayName("2. Consumer emails the customer an order confirmation and records the event durably")
    void testProducerSendsEvent_AndConsumerProcessesNotification() throws Exception {
        User user = customer();
        String eventId = "ORDER_CREATED-" + UUID.randomUUID();
        orderEventProducer.sendOrderCreatedEvent(event(eventId, 123L, user.getId()));

        assertTrue(waitForCondition(() -> processedEvents.existsById(eventId), 10), "event must be recorded in processed_events");
        verify(emailService).sendOrderConfirmation(eq(user.getEmail()), eq(user.getName()), eq(123L), eq(new BigDecimal("2499.00")), anyList());
        assertEquals(1, orderNotificationConsumer.getSimulatedNotificationCount());
        ConsumedOrderEventRecord record = orderNotificationConsumer.getRecentConsumedEvents().get(0);
        assertEquals("PROCESSED", record.getStatus());
        assertTrue(record.getNotificationMessage().contains("order #123"));
    }

    @Test
    @DisplayName("3. Duplicate deliveries send ONE email — even after a restart wiped in-memory state")
    void testDuplicateEvent_DoesNotTriggerNotificationTwice() throws Exception {
        User user = customer();
        String sharedEventId = "ORDER_CREATED-dup-" + UUID.randomUUID();
        orderEventProducer.sendOrderCreatedEvent(event(sharedEventId, 789L, user.getId()));
        assertTrue(waitForCondition(() -> processedEvents.existsById(sharedEventId), 10));

        // Simulate a restart: in-memory statistics are gone, the database record is not.
        orderNotificationConsumer.reset();
        orderEventProducer.sendOrderCreatedEvent(event(sharedEventId, 789L, user.getId()));
        assertTrue(waitForCondition(() -> orderNotificationConsumer.getDuplicateCount() >= 1, 10));

        verify(emailService, times(1)).sendOrderConfirmation(eq(user.getEmail()), any(), eq(789L), any(), anyList());
        assertEquals("DUPLICATE", orderNotificationConsumer.getRecentConsumedEvents().get(0).getStatus());
    }

    @Test
    @DisplayName("5. A notification that keeps failing is retried, then parked on the dead-letter topic")
    void failingNotificationGoesToDeadLetterTopic() throws Exception {
        User user = customer();
        String eventId = "ORDER_CREATED-dlt-" + UUID.randomUUID();
        doThrow(new org.springframework.mail.MailSendException("smtp down"))
                .when(emailService).sendOrderConfirmation(eq(user.getEmail()), any(), any(), any(), anyList());

        try (org.apache.kafka.clients.consumer.Consumer<String, String> dlt = new org.springframework.kafka.core.DefaultKafkaConsumerFactory<>(
                org.springframework.kafka.test.utils.KafkaTestUtils.consumerProps("dlt-" + UUID.randomUUID(), "true", broker),
                new org.apache.kafka.common.serialization.StringDeserializer(),
                new org.apache.kafka.common.serialization.StringDeserializer()).createConsumer()) {
            broker.consumeFromAnEmbeddedTopic(dlt, "quickkart.order-events.DLT");
            orderEventProducer.sendOrderCreatedEvent(event(eventId, 555L, user.getId()));

            var record = org.springframework.kafka.test.utils.KafkaTestUtils.getSingleRecord(dlt, "quickkart.order-events.DLT", java.time.Duration.ofSeconds(30));
            assertTrue(record.value().contains(eventId), "the original event is preserved on the DLT");
        }
        // 1 attempt + 3 retries, and the event is NOT marked processed (so it can be replayed later)
        verify(emailService, times(4)).sendOrderConfirmation(eq(user.getEmail()), any(), eq(555L), any(), anyList());
        assertFalse(processedEvents.existsById(eventId));
    }

    private boolean waitForCondition(ConditionCheck check, int maxSeconds) throws InterruptedException {
        long end = System.currentTimeMillis() + TimeUnit.SECONDS.toMillis(maxSeconds);
        while (System.currentTimeMillis() < end) {
            if (check.isSatisfied()) {
                return true;
            }
            Thread.sleep(100);
        }
        return check.isSatisfied();
    }

    @FunctionalInterface
    interface ConditionCheck {
        boolean isSatisfied();
    }
}
