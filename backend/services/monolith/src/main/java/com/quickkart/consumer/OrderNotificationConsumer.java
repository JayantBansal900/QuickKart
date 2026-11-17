package com.quickkart.consumer;

import com.quickkart.dto.OrderCreatedEvent;
import com.quickkart.entity.ProcessedEvent;
import com.quickkart.entity.User;
import com.quickkart.repository.ProcessedEventRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.service.EmailService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Consumes order events published by order-service through its transactional outbox and emails
 * the customer: ORDER_CREATED (COD confirmation), PAYMENT_SUCCEEDED / PAYMENT_FAILED, and
 * ORDER_STATUS_CHANGED for shipped, out for delivery, delivered and cancelled.
 *
 * Delivery semantics: Kafka gives at-least-once delivery, so the same event can arrive twice
 * (producer retry, consumer crash before commit, rebalance). Idempotency is DURABLE: the event id
 * is stored in processed_events after the email is sent, and an id found there is skipped — also
 * after a restart. If the app crashes between "email sent" and "id stored", the email can be sent
 * twice; that is the deliberate at-least-once trade-off (better a duplicate than a lost confirmation).
 *
 * Failures are NOT swallowed: an exception goes to the container's error handler, which retries
 * with back-off and then parks the record on the dead-letter topic (see KafkaConfig).
 */
@Service
public class OrderNotificationConsumer {

    static final String CONSUMER_NAME = "order-notifications";
    private static final Logger log = LoggerFactory.getLogger(OrderNotificationConsumer.class);

    private final ProcessedEventRepository processedEvents;
    private final UserRepository users;
    private final EmailService emailService;

    // In-memory counters/buffer for observability only — NOT used for idempotency.
    private final List<ConsumedOrderEventRecord> recentConsumedEvents = new CopyOnWriteArrayList<>();
    private final Set<String> recentEventIds = Collections.synchronizedSet(new LinkedHashSet<>());
    private final AtomicLong totalConsumedCount = new AtomicLong();
    private final AtomicLong duplicateCount = new AtomicLong();
    private final AtomicLong notificationCount = new AtomicLong();

    public OrderNotificationConsumer(ProcessedEventRepository processedEvents, UserRepository users, EmailService emailService) {
        this.processedEvents = processedEvents;
        this.users = users;
        this.emailService = emailService;
    }

    @KafkaListener(
            topics = "${app.kafka.topics.order-events:quickkart.order-events}",
            groupId = "${spring.kafka.consumer.group-id:quickkart-order-notifications}"
    )
    public void consumeOrderCreatedEvent(OrderCreatedEvent event) {
        totalConsumedCount.incrementAndGet();
        if (event == null || event.getEventId() == null) {
            log.warn("Skipping order event without an id");
            return;
        }
        String eventId = event.getEventId();

        if (processedEvents.existsById(eventId)) {
            duplicateCount.incrementAndGet();
            log.info("Duplicate order event {} for order #{} skipped (already processed)", eventId, event.getOrderId());
            record(event, true, "DUPLICATE", "Already processed; notification not repeated");
            return;
        }

        User user = event.getUserId() == null ? null : users.findById(event.getUserId()).orElse(null);
        String message;
        if (user == null) {
            message = "No account for user #" + event.getUserId() + "; nothing to notify";
            log.warn("Order event {}: {}", eventId, message);
        } else {
            // Throws on failure -> retried by the error handler, then dead-lettered.
            message = notify(user, event);
        }

        try {
            processedEvents.saveAndFlush(new ProcessedEvent(eventId, CONSUMER_NAME));
        } catch (DataIntegrityViolationException alreadyStored) {
            // Another delivery of the same event finished first; nothing else to do.
            duplicateCount.incrementAndGet();
        }
        log.info("Order event {} processed: {}", eventId, message);
        record(event, false, "PROCESSED", message);
    }

    /** Sends the email that matches the event, if any, and returns a short description for the log. */
    private String notify(User user, OrderCreatedEvent event) {
        String type = event.getEventType() == null ? "ORDER_CREATED" : event.getEventType();
        Long orderId = event.getOrderId();
        switch (type) {
            case "ORDER_CREATED" -> {
                // Online orders are confirmed by PAYMENT_SUCCEEDED instead; events from before payments existed are COD.
                if (event.getPaymentMethod() != null && !"COD".equals(event.getPaymentMethod())) {
                    return "Order #" + orderId + " awaits online payment; no email yet";
                }
                emailService.sendOrderConfirmation(user.getEmail(), user.getName(), orderId, event.getTotalAmount(), event.getItems());
                notificationCount.incrementAndGet();
                return "Order confirmation email sent for order #" + orderId;
            }
            case "PAYMENT_SUCCEEDED" -> {
                return update(user, orderId, "Payment received for order #" + orderId, "Payment received, order placed",
                        "we received your payment of " + money(event.getTotalAmount()) + ". Your order is placed and we'll let you know when it ships.");
            }
            case "PAYMENT_FAILED" -> {
                return update(user, orderId, "Payment failed for order #" + orderId, "Your payment didn't go through",
                        "no money was taken. Your items are reserved for 30 minutes: open My Orders to try again or cancel the order.");
            }
            case "ORDER_STATUS_CHANGED" -> {
                String status = event.getStatus() == null ? "" : event.getStatus();
                return switch (status) {
                    case "SHIPPED" -> update(user, orderId, "Order #" + orderId + " has shipped", "Your order is on its way",
                            "order #" + orderId + " has left our warehouse.");
                    case "OUT_FOR_DELIVERY" -> update(user, orderId, "Order #" + orderId + " is out for delivery", "Arriving today",
                            "order #" + orderId + " is out for delivery."
                                    + ("COD".equals(event.getPaymentMethod()) ? " Please keep " + money(event.getTotalAmount()) + " ready for cash on delivery." : ""));
                    case "DELIVERED" -> update(user, orderId, "Order #" + orderId + " was delivered", "Delivered",
                            "order #" + orderId + " was delivered. Enjoy it, and tell other shoppers what you think with a review.");
                    case "CANCELLED" -> update(user, orderId, "Order #" + orderId + " was cancelled", "Your order was cancelled",
                            "order #" + orderId + " was cancelled." + ("REFUNDED".equals(event.getPaymentStatus())
                                    ? " Your payment of " + money(event.getTotalAmount()) + " has been refunded." : ""));
                    default -> "Status " + status + " for order #" + orderId + " needs no email";
                };
            }
            default -> {
                log.warn("Unknown order event type {} ({}); skipped", type, event.getEventId());
                return "Unknown event type " + type + "; skipped";
            }
        }
    }

    private String update(User user, Long orderId, String subject, String headline, String message) {
        emailService.sendOrderUpdate(user.getEmail(), user.getName(), orderId, subject, headline, message);
        notificationCount.incrementAndGet();
        return "Email \"" + subject + "\" sent";
    }

    private static String money(java.math.BigDecimal amount) {
        return java.text.NumberFormat.getCurrencyInstance(java.util.Locale.forLanguageTag("en-IN"))
                .format(amount == null ? java.math.BigDecimal.ZERO : amount);
    }

    private void record(OrderCreatedEvent event, boolean duplicate, String status, String message) {
        recentConsumedEvents.add(0, new ConsumedOrderEventRecord(event.getEventId(), event.getOrderId(), event.getUserId(),
                event.getTotalAmount(), LocalDateTime.now(), duplicate, status, message));
        while (recentConsumedEvents.size() > 50) recentConsumedEvents.remove(recentConsumedEvents.size() - 1);
        recentEventIds.add(event.getEventId());
        while (recentEventIds.size() > 200) recentEventIds.remove(recentEventIds.iterator().next());
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

    /** Number of confirmation emails handed to the email service. */
    public long getSimulatedNotificationCount() {
        return notificationCount.get();
    }

    /** Recently seen event ids (observability only; the durable record is processed_events). */
    public Set<String> getProcessedEventIds() {
        synchronized (recentEventIds) {
            return Set.copyOf(recentEventIds);
        }
    }

    /** Clears the in-memory statistics. The durable processed_events table is untouched. */
    public void reset() {
        recentConsumedEvents.clear();
        recentEventIds.clear();
        totalConsumedCount.set(0);
        duplicateCount.set(0);
        notificationCount.set(0);
    }
}
