package com.quickkart.order.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Transactional outbox row: an event that must reach Kafka. It is inserted in the SAME database
 * transaction as the business change (the order), so an order can never exist without its event
 * and an event is never published for an order that rolled back. OutboxRelay publishes it later.
 */
@Entity
@Table(name = "outbox_events")
public class OutboxEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", nullable = false, unique = true, length = 120)
    private String eventId;

    @Column(name = "topic", nullable = false, length = 200)
    private String topic;

    @Column(name = "message_key", length = 200)
    private String messageKey;

    @Column(name = "payload", nullable = false, columnDefinition = "text")
    private String payload;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 500)
    private String lastError;

    protected OutboxEvent() {
    }

    public OutboxEvent(String eventId, String topic, String messageKey, String payload) {
        this.eventId = eventId;
        this.topic = topic;
        this.messageKey = messageKey;
        this.payload = payload;
        this.createdAt = LocalDateTime.now();
    }

    public void markPublished() {
        this.publishedAt = LocalDateTime.now();
        this.lastError = null;
    }

    public void markFailed(String error) {
        this.attempts++;
        this.lastError = error == null ? null : error.substring(0, Math.min(500, error.length()));
    }

    public Long getId() { return id; }
    public String getEventId() { return eventId; }
    public String getTopic() { return topic; }
    public String getMessageKey() { return messageKey; }
    public String getPayload() { return payload; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getPublishedAt() { return publishedAt; }
    public int getAttempts() { return attempts; }
    public String getLastError() { return lastError; }
}
