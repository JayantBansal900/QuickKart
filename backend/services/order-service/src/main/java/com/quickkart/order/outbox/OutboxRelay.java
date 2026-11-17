package com.quickkart.order.outbox;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.order.dto.OrderCreatedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Publishes pending outbox rows to Kafka, oldest first, and marks them published.
 *
 * - At-least-once: if the app dies after Kafka accepted a record but before the row is marked,
 *   the record is sent again on the next run. The consumer de-duplicates by event id.
 * - Ordering: a batch stops at the first failure, so a later event is never published before an
 *   earlier one; the failed row is retried on the next tick (attempts / last_error are recorded).
 * - One relay per service instance is assumed. With several instances, the pending-row query
 *   would need SELECT ... FOR UPDATE SKIP LOCKED so two relays don't publish the same row.
 */
@Component
@ConditionalOnProperty(name = "app.outbox.relay.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxEventRepository outbox;
    private final KafkaTemplate<String, Object> kafka;
    private final ObjectMapper objectMapper;

    public OutboxRelay(OutboxEventRepository outbox, KafkaTemplate<String, Object> kafka, ObjectMapper objectMapper) {
        this.outbox = outbox;
        this.kafka = kafka;
        this.objectMapper = objectMapper;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms:1000}", initialDelayString = "${app.outbox.initial-delay-ms:5000}")
    public void publishPending() {
        publishBatch();
    }

    /** @return number of rows published in this run */
    public int publishBatch() {
        int published = 0;
        for (OutboxEvent row : outbox.findTop50ByPublishedAtIsNullOrderByIdAsc()) {
            try {
                OrderCreatedEvent event = objectMapper.readValue(row.getPayload(), OrderCreatedEvent.class);
                kafka.send(row.getTopic(), row.getMessageKey(), event).get(10, TimeUnit.SECONDS);
                row.markPublished();
                outbox.save(row);
                published++;
            } catch (Exception ex) {
                if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
                row.markFailed(ex.getClass().getSimpleName() + ": " + ex.getMessage());
                outbox.save(row);
                log.warn("Outbox event {} not published yet (attempt {}): {}", row.getEventId(), row.getAttempts(), ex.getClass().getSimpleName());
                break; // keep order: retry this row first on the next tick
            }
        }
        if (published > 0) log.info("Outbox relay published {} event(s)", published);
        return published;
    }
}
