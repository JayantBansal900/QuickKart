package com.quickkart.order;

import com.quickkart.order.dto.AddCartItemRequest;
import com.quickkart.order.dto.CheckoutRequest;
import com.quickkart.order.entity.Product;
import com.quickkart.order.entity.User;
import com.quickkart.order.outbox.OutboxEvent;
import com.quickkart.order.outbox.OutboxEventRepository;
import com.quickkart.order.outbox.OutboxRelay;
import com.quickkart.order.repository.ProductRepository;
import com.quickkart.order.repository.UserRepository;
import com.quickkart.order.service.CartService;
import com.quickkart.order.service.OrderService;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.test.EmbeddedKafkaBroker;
import org.springframework.kafka.test.context.EmbeddedKafka;
import org.springframework.kafka.test.utils.KafkaTestUtils;
import org.springframework.test.annotation.DirtiesContext;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Checkout → outbox row (same transaction) → relay → real (embedded) Kafka broker.
 */
@SpringBootTest(properties = {"app.outbox.relay.enabled=true", "app.outbox.initial-delay-ms=600000"})
@EmbeddedKafka(partitions = 1, topics = {"quickkart.order-events"}, bootstrapServersProperty = "spring.kafka.bootstrap-servers")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OutboxIntegrationTest {

    @Autowired OrderService orders;
    @Autowired CartService carts;
    @Autowired UserRepository users;
    @Autowired ProductRepository products;
    @Autowired OutboxEventRepository outbox;
    @Autowired OutboxRelay relay;
    @Autowired JdbcTemplate jdbc;
    @Autowired EmbeddedKafkaBroker broker;

    private User customer() {
        User u = new User("Outbox Customer", UUID.randomUUID() + "@example.invalid", "unused", "USER");
        u.setEmailVerified(true);
        u.setAccountStatus("ACTIVE");
        return users.saveAndFlush(u);
    }

    private CheckoutRequest request(User u) {
        CheckoutRequest r = new CheckoutRequest();
        r.setPaymentMethod("COD");
        r.setIdempotencyKey(UUID.randomUUID().toString());
        r.setCartFingerprint(carts.getCart(u.getEmail()).getFingerprint());
        r.setRecipientName("Test Customer");
        r.setDeliveryAddress("12 Outbox Lane, Test City");
        r.setDeliveryPhone("9876543210");
        return r;
    }

    private long checkout(User u, Product p) {
        carts.addToCart(u.getEmail(), new AddCartItemRequest(p.getId(), 1));
        return orders.checkout(u.getEmail(), request(u)).getOrderId();
    }

    @Test
    void checkoutWritesOneOutboxRowAndTheRelayDeliversItToKafka() throws Exception {
        User u = customer();
        Product p = products.saveAndFlush(new Product("Outbox Kettle", "d", new BigDecimal("49.00"), 5, "Test"));
        long orderId = checkout(u, p);

        List<OutboxEvent> rows = outbox.findAll().stream().filter(r -> r.getEventId().equals("ORDER_CREATED-" + orderId)).toList();
        assertEquals(1, rows.size(), "exactly one outbox row per order");
        assertNull(rows.get(0).getPublishedAt(), "not published until the relay runs");

        try (Consumer<String, String> consumer = new DefaultKafkaConsumerFactory<>(
                KafkaTestUtils.consumerProps("outbox-test-" + UUID.randomUUID(), "true", broker),
                new StringDeserializer(), new StringDeserializer()).createConsumer()) {
            broker.consumeFromAnEmbeddedTopic(consumer, "quickkart.order-events");

            // The scheduler calls the relay every second; simulate ticks. The first send can time out
            // while the producer fetches cluster metadata — that row simply stays pending and is
            // retried, which is exactly the behaviour under a real Kafka hiccup.
            long deadline = System.currentTimeMillis() + 20_000;
            while (outbox.findById(rows.get(0).getId()).orElseThrow().getPublishedAt() == null && System.currentTimeMillis() < deadline) {
                relay.publishBatch();
            }

            ConsumerRecord<String, String> record = KafkaTestUtils.getRecords(consumer, Duration.ofSeconds(10)).records("quickkart.order-events")
                    .iterator().next();
            assertEquals(String.valueOf(orderId), record.key(), "keyed by order id (per-order ordering)");
            assertTrue(record.value().contains("\"eventId\":\"ORDER_CREATED-" + orderId + "\""));
            assertTrue(record.value().contains("\"orderId\":" + orderId));
        }
        assertNotNull(outbox.findById(rows.get(0).getId()).orElseThrow().getPublishedAt());
        assertEquals(0, relay.publishBatch(), "a published row is not sent again");
    }

    @Test
    void aRolledBackCheckoutLeavesNoOutboxRow() {
        User u = customer();
        Product p = products.saveAndFlush(new Product("Rollback Kettle", "d", new BigDecimal("271828.18"), 5, "Test"));
        long before = outbox.count();
        carts.addToCart(u.getEmail(), new AddCartItemRequest(p.getId(), 1));
        CheckoutRequest r = request(u);
        jdbc.execute("ALTER TABLE payments ADD CONSTRAINT outbox_forced_failure CHECK (amount <> 271828.18)");
        try {
            assertThrows(RuntimeException.class, () -> orders.checkout(u.getEmail(), r));
        } finally {
            jdbc.execute("ALTER TABLE payments DROP CONSTRAINT outbox_forced_failure");
        }
        assertEquals(before, outbox.count(), "the outbox row must roll back together with the order");
    }
}
