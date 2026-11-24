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

    private final com.quickkart.service.AnalyticsService analyticsService;

    public AdminAnalyticsController(ProductRepository productRepository,
                                    OrderRepository orderRepository,
                                    UserRepository userRepository,
                                    com.quickkart.service.AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.userRepository = userRepository;
    }

    @GetMapping
    public ResponseEntity<AdminAnalyticsResponse> getAnalytics() {
        long totalProducts = productRepository.countOnSale();
        // Low stock = still sellable but running out (1-4); out-of-stock is reported separately.
        long lowStockCount = productRepository.countOnSaleWithStockBetween(1, LOW_STOCK_THRESHOLD - 1);
        long outOfStockCount = productRepository.countOnSaleOutOfStock();

        long totalOrders = orderRepository.count();
        // Booked revenue = all placed orders that are not cancelled (COD not yet collected included, unpaid online orders excluded).
        BigDecimal totalRevenue = orderRepository.calculateTotalRevenue();
        BigDecimal collectedRevenue = orderRepository.calculateCollectedRevenue();
        // "Pending" = placed but not yet shipped (awaiting fulfilment).
        long pendingOrdersCount = orderRepository.countByStatusIn(List.of("PLACED", "CONFIRMED", "PROCESSING"));

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

    /** Revenue and orders per day, registrations, best sellers and category performance for the last {@code days} days (7-365). */
    @GetMapping("/insights")
    public ResponseEntity<com.quickkart.dto.AnalyticsInsights> insights(
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "30") int days) {
        return ResponseEntity.ok(analyticsService.insights(days));
    }
}
