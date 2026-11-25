package com.quickkart.order.controller;

import com.quickkart.order.dto.CheckoutRequest;
import com.quickkart.order.dto.OrderResponse;
import com.quickkart.order.service.OrderService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping({"", "/checkout"})
    public ResponseEntity<OrderResponse> checkout(
            Authentication authentication,
            @jakarta.validation.Valid @RequestBody CheckoutRequest request) {
        OrderResponse response = orderService.checkout(authentication.getName(), request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    /** Methods the checkout accepts right now, so the UI only offers those. */
    @GetMapping("/payment-methods")
    public java.util.Map<String,java.util.List<String>> paymentMethods() {
        return java.util.Map.of("methods",orderService.paymentMethods());
    }

    /** Simulated payment gateway: {"outcome":"SUCCESS"} or {"outcome":"FAILURE"} (test mode, no card data). */
    @PostMapping("/{id}/pay")
    public ResponseEntity<OrderResponse> pay(Authentication authentication,@PathVariable Long id,
                                             @RequestBody(required=false) java.util.Map<String,String> body) {
        String outcome=body==null ? "SUCCESS" : body.getOrDefault("outcome","SUCCESS");
        if(!"SUCCESS".equalsIgnoreCase(outcome) && !"FAILURE".equalsIgnoreCase(outcome))
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST,"outcome must be SUCCESS or FAILURE");
        return ResponseEntity.ok(orderService.pay(authentication.getName(),id,"SUCCESS".equalsIgnoreCase(outcome)));
    }

    /** Ask to return a delivered order: {"reason":"DAMAGED","comment":"..."}. */
    @PostMapping("/{id}/return")
    public ResponseEntity<OrderResponse> requestReturn(Authentication authentication,@PathVariable Long id,
                                                       @RequestBody java.util.Map<String,String> body) {
        return ResponseEntity.ok(orderService.requestReturn(authentication.getName(),id,body.get("reason"),body.get("comment")));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<OrderResponse> cancel(Authentication authentication,@PathVariable Long id) {
        return ResponseEntity.ok(orderService.cancelOrder(authentication.getName(),id));
    }
    @GetMapping
    public ResponseEntity<List<OrderResponse>> getUserOrders(Authentication authentication) {
        List<OrderResponse> response = orderService.getUserOrders(authentication.getName());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{id}")
    public ResponseEntity<OrderResponse> getOrderById(
            Authentication authentication,
            @PathVariable Long id) {
        OrderResponse response = orderService.getOrderById(authentication.getName(), id);
        return ResponseEntity.ok(response);
    }
}
