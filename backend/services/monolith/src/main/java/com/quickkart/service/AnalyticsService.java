package com.quickkart.service;

import com.quickkart.dto.AnalyticsInsights;
import com.quickkart.dto.AnalyticsInsights.CategoryRevenue;
import com.quickkart.dto.AnalyticsInsights.DailyPoint;
import com.quickkart.dto.AnalyticsInsights.NamedValue;
import com.quickkart.dto.AnalyticsInsights.TopProduct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only reporting over the shared database: a handful of GROUP BY queries, so the work stays in
 * PostgreSQL (one round trip each) instead of loading orders into memory.
 * "Booked" orders are placed and not cancelled; unpaid online orders (PENDING) are left out.
 */
@Service
public class AnalyticsService {

    private static final String BOOKED = "o.status NOT IN ('CANCELLED', 'PENDING', 'RETURNED')";

    private final JdbcTemplate jdbc;

    public AnalyticsService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public AnalyticsInsights insights(int requestedDays) {
        int days = Math.max(7, Math.min(365, requestedDays));
        LocalDate today = LocalDate.now();
        LocalDate first = today.minusDays(days - 1L);
        Timestamp since = Timestamp.valueOf(first.atStartOfDay());

        Map<LocalDate, BigDecimal> revenueByDay = new HashMap<>();
        Map<LocalDate, Long> ordersByDay = new HashMap<>();
        jdbc.query("SELECT CAST(o.created_at AS DATE) AS d, COALESCE(SUM(o.total_amount), 0) AS revenue, COUNT(*) AS n "
                        + "FROM orders o WHERE o.created_at >= ? AND " + BOOKED + " GROUP BY CAST(o.created_at AS DATE)",
                rs -> {
                    LocalDate d = rs.getDate("d").toLocalDate();
                    revenueByDay.put(d, rs.getBigDecimal("revenue"));
                    ordersByDay.put(d, rs.getLong("n"));
                }, since);

        Map<LocalDate, Long> signupsByDay = new HashMap<>();
        jdbc.query("SELECT CAST(u.created_at AS DATE) AS d, COUNT(*) AS n FROM users u "
                        + "WHERE u.created_at >= ? AND u.role = 'USER' AND u.email_verified = true GROUP BY CAST(u.created_at AS DATE)",
                rs -> { signupsByDay.put(rs.getDate("d").toLocalDate(), rs.getLong("n")); }, since);

        List<DailyPoint> daily = new ArrayList<>(days);
        BigDecimal revenue = BigDecimal.ZERO;
        long orders = 0;
        long newCustomers = 0;
        for (LocalDate d = first; !d.isAfter(today); d = d.plusDays(1)) {
            BigDecimal r = revenueByDay.getOrDefault(d, BigDecimal.ZERO);
            long n = ordersByDay.getOrDefault(d, 0L);
            long s = signupsByDay.getOrDefault(d, 0L);
            daily.add(new DailyPoint(d, r, n, s));
            revenue = revenue.add(r);
            orders += n;
            newCustomers += s;
        }
        BigDecimal aov = orders == 0 ? BigDecimal.ZERO : revenue.divide(BigDecimal.valueOf(orders), 2, RoundingMode.HALF_UP);

        List<NamedValue> byStatus = jdbc.query("SELECT o.status AS name, COUNT(*) AS n FROM orders o WHERE o.created_at >= ? "
                        + "GROUP BY o.status ORDER BY COUNT(*) DESC",
                (rs, i) -> new NamedValue(rs.getString("name"), rs.getLong("n")), since);

        List<NamedValue> payments = jdbc.query("SELECT p.payment_method AS name, COUNT(*) AS n FROM payments p "
                        + "JOIN orders o ON o.id = p.order_id WHERE o.created_at >= ? AND " + BOOKED
                        + " GROUP BY p.payment_method ORDER BY COUNT(*) DESC",
                (rs, i) -> new NamedValue(rs.getString("name"), rs.getLong("n")), since);

        List<TopProduct> top = jdbc.query("SELECT oi.product_id AS id, MAX(COALESCE(oi.product_name, p.name)) AS name, "
                        + "SUM(oi.quantity) AS units, SUM(oi.price * oi.quantity) AS revenue "
                        + "FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id "
                        + "WHERE o.created_at >= ? AND " + BOOKED + " GROUP BY oi.product_id "
                        + "ORDER BY SUM(oi.quantity) DESC, SUM(oi.price * oi.quantity) DESC FETCH FIRST 5 ROWS ONLY",
                (rs, i) -> new TopProduct(rs.getLong("id"), rs.getString("name"), rs.getLong("units"), rs.getBigDecimal("revenue")), since);

        List<CategoryRevenue> categories = jdbc.query("SELECT COALESCE(p.category, 'Uncategorised') AS category, "
                        + "SUM(oi.quantity) AS units, SUM(oi.price * oi.quantity) AS revenue "
                        + "FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id "
                        + "WHERE o.created_at >= ? AND " + BOOKED + " GROUP BY COALESCE(p.category, 'Uncategorised') "
                        + "ORDER BY SUM(oi.price * oi.quantity) DESC",
                (rs, i) -> new CategoryRevenue(rs.getString("category"), rs.getLong("units"), rs.getBigDecimal("revenue")), since);

        return new AnalyticsInsights(days, revenue, orders, aov, newCustomers, daily, byStatus, payments, top, categories);
    }
}
