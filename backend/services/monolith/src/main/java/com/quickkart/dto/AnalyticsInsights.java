package com.quickkart.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Time-series and breakdowns for the admin analytics page. Money is booked revenue (placed, not cancelled). */
public record AnalyticsInsights(
        int days,
        BigDecimal revenue,
        long orders,
        BigDecimal averageOrderValue,
        long newCustomers,
        List<DailyPoint> daily,
        List<NamedValue> ordersByStatus,
        List<NamedValue> paymentMethods,
        List<TopProduct> topProducts,
        List<CategoryRevenue> categories
) {
    public record DailyPoint(LocalDate date, BigDecimal revenue, long orders, long registrations) {}
    public record NamedValue(String name, long count) {}
    public record TopProduct(Long productId, String name, long units, BigDecimal revenue) {}
    public record CategoryRevenue(String category, long units, BigDecimal revenue) {}
}
