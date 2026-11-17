package com.quickkart;
import com.quickkart.event.OrderTransactionEventListener;
import com.quickkart.event.OrderCreatedInternalEvent;
import com.quickkart.producer.OrderEventProducer;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
class OrderNotificationReliabilityTest {
 @Test void notificationFailureDoesNotTurnCommittedOrderIntoCheckoutFailure(){
  var producer=mock(OrderEventProducer.class);
  when(producer.sendOrderCreatedEvent(any())).thenThrow(new IllegalStateException("Broker unavailable"));
  var listener=new OrderTransactionEventListener(producer);
  var event=new OrderCreatedInternalEvent(1L,2L,BigDecimal.TEN,LocalDateTime.now(),List.of());
  assertDoesNotThrow(()->listener.handleOrderCreatedAfterCommit(event));
  verify(producer).sendOrderCreatedEvent(argThat(e->"ORDER_CREATED-1".equals(e.getEventId())));
 }
}
