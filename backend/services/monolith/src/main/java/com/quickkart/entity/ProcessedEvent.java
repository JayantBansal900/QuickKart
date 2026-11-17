package com.quickkart.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Durable idempotency record for Kafka consumers: one row per event that has been fully handled.
 * Survives restarts and rebalances, unlike the old in-memory Set.
 */
@Entity
@Table(name = "processed_events")
public class ProcessedEvent {

    @Id
    @Column(name = "event_id", length = 120)
    private String eventId;

    @Column(name = "consumer", nullable = false, length = 80)
    private String consumer;

    @Column(name = "processed_at", nullable = false)
    private LocalDateTime processedAt;

    protected ProcessedEvent() {
    }

    public ProcessedEvent(String eventId, String consumer) {
        this.eventId = eventId;
        this.consumer = consumer;
        this.processedAt = LocalDateTime.now();
    }

    public String getEventId() { return eventId; }
    public String getConsumer() { return consumer; }
    public LocalDateTime getProcessedAt() { return processedAt; }
}
