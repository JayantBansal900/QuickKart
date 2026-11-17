package com.quickkart.controller;

import com.quickkart.dto.AdminAnalyticsResponse;
import com.quickkart.repository.OrderRepository;
import com.quickkart.repository.ProductRepository;
import com.quickkart.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/admin/analytics")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAnalyticsController {

    private static final int LOW_STOCK_THRESHOLD = 5;

    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    public AdminAnalyticsController(ProductRepository productRepository,
                                    OrderRepository orderRepository,
                                    UserRepository userRepository) {
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<AdminAnalyticsResponse> getAnalytics() {
        long totalProducts = productRepository.count();
        // Low stock = still sellable but running out (1-4); out-of-stock is reported separately.
        long lowStockCount = productRepository.countByStockQuantityBetween(1, LOW_STOCK_THRESHOLD - 1);
        long outOfStockCount = productRepository.countByStockQuantityLessThanEqual(0);

        long totalOrders = orderRepository.count();
        // Booked revenue = value of all non-cancelled orders (includes COD not yet collected).
        BigDecimal totalRevenue = orderRepository.calculateTotalRevenue();
        BigDecimal collectedRevenue = orderRepository.calculateCollectedRevenue();
        // Checkout creates CONFIRMED orders, so "pending" means "awaiting fulfilment", not just PENDING.
        long pendingOrdersCount = orderRepository.countByStatusIn(List.of("PENDING", "CONFIRMED", "PROCESSING"));

        long totalUsers = userRepository.count();
        long verifiedUsersCount = userRepository.countByEmailVerifiedTrue();

        AdminAnalyticsResponse response = new AdminAnalyticsResponse(
                totalProducts,
                lowStockCount,
                outOfStockCount,
                totalOrders,
                totalRevenue != null ? totalRevenue : BigDecimal.ZERO,
                totalUsers,
                verifiedUsersCount,
                pendingOrdersCount
        );

        response.setCollectedRevenue(collectedRevenue != null ? collectedRevenue : BigDecimal.ZERO);
        return ResponseEntity.ok(response);
    }
}
