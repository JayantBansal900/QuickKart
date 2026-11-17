package com.quickkart.dto;

import java.math.BigDecimal;

public class AdminAnalyticsResponse {

    private long totalProducts;
    private long lowStockCount;
    private long outOfStockCount;
    private long totalOrders;
    private BigDecimal totalRevenue;
    private long totalUsers;
    private long verifiedUsersCount;
    private long pendingOrdersCount;
    private BigDecimal collectedRevenue = BigDecimal.ZERO;

    public BigDecimal getCollectedRevenue() {
        return collectedRevenue;
    }

    public void setCollectedRevenue(BigDecimal collectedRevenue) {
        this.collectedRevenue = collectedRevenue;
    }

    public AdminAnalyticsResponse() {
    }

    public AdminAnalyticsResponse(long totalProducts, long lowStockCount, long outOfStockCount, long totalOrders, BigDecimal totalRevenue, long totalUsers, long verifiedUsersCount, long pendingOrdersCount) {
        this.totalProducts = totalProducts;
        this.lowStockCount = lowStockCount;
        this.outOfStockCount = outOfStockCount;
        this.totalOrders = totalOrders;
        this.totalRevenue = totalRevenue;
        this.totalUsers = totalUsers;
        this.verifiedUsersCount = verifiedUsersCount;
        this.pendingOrdersCount = pendingOrdersCount;
    }

    public long getTotalProducts() {
        return totalProducts;
    }

    public void setTotalProducts(long totalProducts) {
        this.totalProducts = totalProducts;
    }

    public long getLowStockCount() {
        return lowStockCount;
    }

    public void setLowStockCount(long lowStockCount) {
        this.lowStockCount = lowStockCount;
    }

    public long getOutOfStockCount() {
        return outOfStockCount;
    }

    public void setOutOfStockCount(long outOfStockCount) {
        this.outOfStockCount = outOfStockCount;
    }

    public long getTotalOrders() {
        return totalOrders;
    }

    public void setTotalOrders(long totalOrders) {
        this.totalOrders = totalOrders;
    }

    public BigDecimal getTotalRevenue() {
        return totalRevenue;
    }

    public void setTotalRevenue(BigDecimal totalRevenue) {
        this.totalRevenue = totalRevenue;
    }

    public long getTotalUsers() {
        return totalUsers;
    }

    public void setTotalUsers(long totalUsers) {
        this.totalUsers = totalUsers;
    }

    public long getVerifiedUsersCount() {
        return verifiedUsersCount;
    }

    public void setVerifiedUsersCount(long verifiedUsersCount) {
        this.verifiedUsersCount = verifiedUsersCount;
    }

    public long getPendingOrdersCount() {
        return pendingOrdersCount;
    }

    public void setPendingOrdersCount(long pendingOrdersCount) {
        this.pendingOrdersCount = pendingOrdersCount;
    }
}
