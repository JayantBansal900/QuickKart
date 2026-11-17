package com.quickkart.controller;

import com.quickkart.dto.PaymentRequest;
import com.quickkart.dto.PaymentResponse;
import com.quickkart.service.PaymentService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping
    public ResponseEntity<PaymentResponse> processPayment(
            Authentication authentication,
            @Valid @RequestBody PaymentRequest request) {
        PaymentResponse response = paymentService.processPayment(authentication.getName(), request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/order/{orderId}")
    public ResponseEntity<PaymentResponse> getPaymentByOrderId(
            Authentication authentication,
            @PathVariable Long orderId) {
        PaymentResponse response = paymentService.getPaymentByOrderId(authentication.getName(), orderId);
        return ResponseEntity.ok(response);
    }
}
