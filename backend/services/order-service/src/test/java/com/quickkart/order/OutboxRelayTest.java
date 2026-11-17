package com.quickkart.order;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.quickkart.order.outbox.OutboxEvent;
import com.quickkart.order.outbox.OutboxEventRepository;
import com.quickkart.order.outbox.OutboxRelay;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.util.List;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Relay behaviour when Kafka is unavailable: nothing is lost and order is preserved. */
class OutboxRelayTest {

    private static OutboxEvent row(String id) {
        return new OutboxEvent(id, "quickkart.order-events", id,
                "{\"eventId\":\"" + id + "\",\"eventType\":\"ORDER_CREATED\",\"orderId\":1,\"userId\":2,\"totalAmount\":10,\"items\":[]}");
    }

    @Test
    @SuppressWarnings("unchecked")
    void kafkaOutageKeepsRowsPendingAndStopsTheBatch() {
        OutboxEventRepository repo = mock(OutboxEventRepository.class);
        KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
        OutboxEvent first = row("ORDER_CREATED-1"), second = row("ORDER_CREATED-2");
        when(repo.findTop50ByPublishedAtIsNullOrderByIdAsc()).thenReturn(List.of(first, second));
        when(kafka.send(anyString(), anyString(), any())).thenReturn(CompletableFuture.failedFuture(new RuntimeException("broker down")));

        int published = new OutboxRelay(repo, kafka, new ObjectMapper().registerModule(new JavaTimeModule())).publishBatch();

        assertEquals(0, published);
        assertNull(first.getPublishedAt());
        assertEquals(1, first.getAttempts());
        assertTrue(first.getLastError().contains("broker down"));
        assertEquals(0, second.getAttempts(), "later events wait, so ordering is kept");
        verify(kafka, times(1)).send(anyString(), anyString(), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void recoversOnTheNextRunOnceKafkaIsBack() {
        OutboxEventRepository repo = mock(OutboxEventRepository.class);
        KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
        OutboxEvent pending = row("ORDER_CREATED-3");
        when(repo.findTop50ByPublishedAtIsNullOrderByIdAsc()).thenReturn(List.of(pending));
        when(kafka.send(anyString(), anyString(), any()))
                .thenReturn(CompletableFuture.failedFuture(new RuntimeException("broker down")))
                .thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)));
        OutboxRelay relay = new OutboxRelay(repo, kafka, new ObjectMapper().registerModule(new JavaTimeModule()));

        assertEquals(0, relay.publishBatch());
        assertEquals(1, relay.publishBatch());
        assertNotNull(pending.getPublishedAt());
        assertNull(pending.getLastError());
    }
}
