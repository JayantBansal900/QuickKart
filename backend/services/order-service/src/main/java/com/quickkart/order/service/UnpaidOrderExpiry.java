package com.quickkart.order.service;

import com.quickkart.order.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * Online orders reserve stock at checkout. If the customer never completes the payment, this job
 * cancels the order after a timeout and returns the stock, so abandoned payments can't lock
 * inventory forever. Each order is cancelled in its own transaction under a row lock, so a payment
 * that arrives at the same moment either wins (order becomes PLACED) or sees CANCELLED.
 */
@Component
public class UnpaidOrderExpiry {

    private static final Logger log = LoggerFactory.getLogger(UnpaidOrderExpiry.class);

    private final OrderRepository orders;
    private final OrderService orderService;
    private final long timeoutMinutes;

    public UnpaidOrderExpiry(OrderRepository orders, OrderService orderService,
                             @Value("${app.orders.unpaid-timeout-minutes:30}") long timeoutMinutes) {
        this.orders = orders;
        this.orderService = orderService;
        this.timeoutMinutes = timeoutMinutes;
    }

    @Scheduled(fixedDelayString = "${app.orders.unpaid-expiry-interval-ms:60000}", initialDelay = 30000)
    public int expireUnpaidOrders() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(timeoutMinutes);
        int expired = 0;
        for (Long id : orders.findUnpaidBefore(cutoff)) {
            try {
                if (orderService.expireUnpaid(id, cutoff)) {
                    expired++;
                    log.info("Order #{} cancelled: payment not completed within {} minutes", id, timeoutMinutes);
                }
            } catch (RuntimeException ex) {
                log.warn("Could not expire unpaid order #{}: {}", id, ex.getMessage());
            }
        }
        return expired;
    }
}
