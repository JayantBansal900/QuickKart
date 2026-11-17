package com.quickkart.consumer;

import com.quickkart.dto.OrderCreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Asynchronous Kafka consumer that listens to quickkart.order-events.
 *
 * Consumer Group: quickkart-order-notifications
 *
 * Simulates downstream order confirmation notifications (e.g. Email/SMS/Push notifications)
 * without blocking the upstream checkout transaction.
 *
 * Includes idempotent processing to identify duplicate events using eventId.
 */
@Service
public class OrderNotificationConsumer {

    private static final Logger log = LoggerFactory.getLogger(OrderNotificationConsumer.class);

    // In-memory set of processed event IDs for basic duplicate-awareness (idempotency)
    private final Set<String> processedEventIds = ConcurrentHashMap.newKeySet();

    // In-memory buffer for developer REST API sandbox inspection
    private final List<ConsumedOrderEventRecord> recentConsumedEvents = new CopyOnWriteArrayList<>();

    private final AtomicLong totalConsumedCount = new AtomicLong(0);
    private final AtomicLong duplicateCount = new AtomicLong(0);
    private final AtomicLong simulatedNotificationCount = new AtomicLong(0);

    @KafkaListener(
            topics = "${app.kafka.topics.order-events:quickkart.order-events}",
            groupId = "${spring.kafka.consumer.group-id:quickkart-order-notifications}"
    )
    public void consumeOrderCreatedEvent(OrderCreatedEvent event) {
        totalConsumedCount.incrementAndGet();

        try {
            if (event == null) {
                log.warn("[Kafka Consumer] Received null event from Kafka topic. Skipping.");
                return;
            }

            String eventId = event.getEventId();
            Long orderId = event.getOrderId();
            Long userId = event.getUserId();

            // 1. Basic Idempotency Check
            if (eventId != null && !processedEventIds.add(eventId)) {
                duplicateCount.incrementAndGet();
                log.warn("""
                        ==================================================
                        [Kafka Consumer] DUPLICATE EVENT DETECTED
                        Event ID: {}
                        Order ID: {}
                        Action: Skipped duplicate notification (idempotency enforced)
                        ==================================================""",
                        eventId, orderId);

                recordConsumedEvent(new ConsumedOrderEventRecord(
                        eventId,
                        orderId,
                        userId,
                        event.getTotalAmount(),
                        LocalDateTime.now(),
                        true,
                        "SKIPPED_DUPLICATE",
                        "Duplicate event detected. Notification simulation skipped to maintain idempotency."
                ));
                return;
            }

            // 2. Simulated Downstream Notification
            simulatedNotificationCount.incrementAndGet();
            String simulationMsg = "Simulated email & SMS notification to user #" + userId +
                    " confirming order #" + orderId + " for total $" + event.getTotalAmount();

            log.info("""
                    ==================================================
                    Received ORDER_CREATED event
                    Event ID: {}
                    Order ID: {}
                    User ID: {}
                    Total: {}
                    Action: Order confirmation notification simulated
                    Details: {}
                    ==================================================""",
                    eventId,
                    orderId,
                    userId,
                    event.getTotalAmount(),
                    simulationMsg);

            recordConsumedEvent(new ConsumedOrderEventRecord(
                    eventId,
                    orderId,
                    userId,
                    event.getTotalAmount(),
                    LocalDateTime.now(),
                    false,
                    "PROCESSED",
                    simulationMsg
            ));

        } catch (Exception ex) {
            log.error("[Kafka Consumer] Error processing order event: {}. Reason: {}",
                    event, ex.getMessage(), ex);
            // Record failure for developer visibility
            if (event != null) {
                recordConsumedEvent(new ConsumedOrderEventRecord(
                        event.getEventId(),
                        event.getOrderId(),
                        event.getUserId(),
                        event.getTotalAmount(),
                        LocalDateTime.now(),
                        false,
                        "ERROR",
                        "Failed to process event: " + ex.getMessage()
                ));
            }
        }
    }

    private void recordConsumedEvent(ConsumedOrderEventRecord record) {
        recentConsumedEvents.add(0, record);
        while (recentConsumedEvents.size() > 50) {
            recentConsumedEvents.remove(recentConsumedEvents.size() - 1);
        }
    }

    public List<ConsumedOrderEventRecord> getRecentConsumedEvents() {
        return Collections.unmodifiableList(recentConsumedEvents);
    }

    public long getTotalConsumedCount() {
        return totalConsumedCount.get();
    }

    public long getDuplicateCount() {
        return duplicateCount.get();
    }

    public long getSimulatedNotificationCount() {
        return simulatedNotificationCount.get();
    }

    public Set<String> getProcessedEventIds() {
        return Collections.unmodifiableSet(processedEventIds);
    }

    public void reset() {
        processedEventIds.clear();
        recentConsumedEvents.clear();
        totalConsumedCount.set(0);
        duplicateCount.set(0);
        simulatedNotificationCount.set(0);
    }
}
