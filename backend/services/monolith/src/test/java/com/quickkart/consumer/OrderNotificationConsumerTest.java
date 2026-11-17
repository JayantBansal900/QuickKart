package com.quickkart.consumer;

import com.quickkart.dto.OrderCreatedEvent;
import com.quickkart.entity.User;
import com.quickkart.repository.ProcessedEventRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.service.EmailService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Which email (if any) each order event type produces. */
class OrderNotificationConsumerTest {

    private final ProcessedEventRepository processed = mock(ProcessedEventRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final EmailService email = mock(EmailService.class);
    private final OrderNotificationConsumer consumer = new OrderNotificationConsumer(processed, users, email);

    @BeforeEach
    void setUp() {
        User user = new User("Priya Sharma", "priya@example.invalid", "x", "USER");
        when(users.findById(7L)).thenReturn(Optional.of(user));
    }

    private static OrderCreatedEvent event(String id, String type, String status, String method, String paymentStatus) {
        OrderCreatedEvent e = new OrderCreatedEvent(id, type, 42L, 7L, new BigDecimal("1299.00"), LocalDateTime.now(), List.of());
        e.setStatus(status);
        e.setPaymentMethod(method);
        e.setPaymentStatus(paymentStatus);
        return e;
    }

    @Test
    void codOrderCreatedSendsConfirmation() {
        consumer.consumeOrderCreatedEvent(event("ORDER_CREATED-42", "ORDER_CREATED", "PLACED", "COD", "COLLECTION_PENDING"));
        verify(email).sendOrderConfirmation(eq("priya@example.invalid"), any(), eq(42L), any(), anyList());
    }

    @Test
    void eventsFromBeforePaymentsExistedAreTreatedAsCod() {
        consumer.consumeOrderCreatedEvent(event("ORDER_CREATED-42", null, null, null, null));
        verify(email).sendOrderConfirmation(eq("priya@example.invalid"), any(), eq(42L), any(), anyList());
    }

    @Test
    void onlineOrderWaitsForPaymentBeforeConfirming() {
        consumer.consumeOrderCreatedEvent(event("ORDER_CREATED-42", "ORDER_CREATED", "PENDING", "UPI", "PENDING"));
        verifyNoInteractions(email);

        consumer.consumeOrderCreatedEvent(event("PAYMENT_SUCCEEDED-42", "PAYMENT_SUCCEEDED", "PLACED", "UPI", "PAID"));
        verify(email).sendOrderUpdate(eq("priya@example.invalid"), any(), eq(42L), contains("Payment received"), any(), contains("₹1,299.00"));
    }

    @Test
    void paymentFailureAndShippingProduceUpdates() {
        consumer.consumeOrderCreatedEvent(event("PAYMENT_FAILED-42-a", "PAYMENT_FAILED", "PENDING", "CARD", "FAILED"));
        verify(email).sendOrderUpdate(any(), any(), eq(42L), contains("Payment failed"), any(), any());

        consumer.consumeOrderCreatedEvent(event("ORDER_STATUS-42-SHIPPED", "ORDER_STATUS_CHANGED", "SHIPPED", "CARD", "PAID"));
        verify(email).sendOrderUpdate(any(), any(), eq(42L), contains("has shipped"), any(), any());
    }

    @Test
    void cancellationMentionsRefundOnlyWhenRefunded() {
        consumer.consumeOrderCreatedEvent(event("ORDER_STATUS-42-CANCELLED", "ORDER_STATUS_CHANGED", "CANCELLED", "UPI", "REFUNDED"));
        verify(email).sendOrderUpdate(any(), any(), eq(42L), contains("cancelled"), any(), contains("refunded"));
    }

    @Test
    void internalStatusesSendNoEmail() {
        consumer.consumeOrderCreatedEvent(event("ORDER_STATUS-42-CONFIRMED", "ORDER_STATUS_CHANGED", "CONFIRMED", "COD", "COLLECTION_PENDING"));
        consumer.consumeOrderCreatedEvent(event("ORDER_STATUS-42-PROCESSING", "ORDER_STATUS_CHANGED", "PROCESSING", "COD", "COLLECTION_PENDING"));
        verifyNoInteractions(email);
    }

    @Test
    void alreadyProcessedEventIsSkipped() {
        when(processed.existsById("ORDER_STATUS-42-DELIVERED")).thenReturn(true);
        consumer.consumeOrderCreatedEvent(event("ORDER_STATUS-42-DELIVERED", "ORDER_STATUS_CHANGED", "DELIVERED", "COD", "COLLECTED"));
        verify(email, never()).sendOrderUpdate(any(), any(), any(), any(), any(), any());
    }
}
