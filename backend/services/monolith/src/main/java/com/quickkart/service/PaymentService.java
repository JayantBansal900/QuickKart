package com.quickkart.service;

import com.quickkart.dto.PaymentRequest;
import com.quickkart.dto.PaymentResponse;
import com.quickkart.entity.Order;
import com.quickkart.entity.Payment;
import com.quickkart.entity.User;
import com.quickkart.exception.DuplicatePaymentException;
import com.quickkart.exception.InvalidPaymentMethodException;
import com.quickkart.exception.OrderNotFoundException;
import com.quickkart.exception.PaymentNotFoundException;
import com.quickkart.exception.ResourceNotFoundException;
import com.quickkart.exception.UnauthorizedPaymentAccessException;
import com.quickkart.repository.OrderRepository;
import com.quickkart.repository.PaymentRepository;
import com.quickkart.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.UUID;

@Service
public class PaymentService {

    private static final Set<String> ALLOWED_PAYMENT_METHODS = Set.of("CARD", "UPI", "COD");

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    public PaymentService(
            PaymentRepository paymentRepository,
            OrderRepository orderRepository,
            UserRepository userRepository) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public PaymentResponse processPayment(String userEmail, PaymentRequest request) {
        throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_IMPLEMENTED,
                "Online payment processing is not configured. Checkout supports unpaid cash on delivery only.");
    }

    @Transactional(readOnly = true)
    public PaymentResponse getPaymentByOrderId(String userEmail, Long orderId) {
        User user = userRepository.findByEmail(userEmail)
                .orElseThrow(() -> new ResourceNotFoundException("User not found with email: " + userEmail));

        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFoundException(orderId));

        // Must return payment information only when authenticated user owns the order
        if (!order.getUser().getId().equals(user.getId())) {
            throw new UnauthorizedPaymentAccessException("You do not have permission to access payment details for order with id: " + orderId);
        }

        Payment payment = paymentRepository.findByOrderId(orderId)
                .orElseThrow(() -> new PaymentNotFoundException("Payment not found for order with id: " + orderId));

        return PaymentResponse.fromEntity(payment);
    }
}
