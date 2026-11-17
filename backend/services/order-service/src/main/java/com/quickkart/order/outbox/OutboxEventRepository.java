package com.quickkart.order.outbox;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, Long> {

    /** Oldest first, so events for the same order are published in the order they were written. */
    List<OutboxEvent> findTop50ByPublishedAtIsNullOrderByIdAsc();

    long countByPublishedAtIsNull();
}
