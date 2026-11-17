package com.quickkart.product.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * Relative stock change used by the admin inventory screen.
 * Positive = restock, negative = write-off/correction. Relative (not absolute) so that a
 * concurrent checkout that just decremented stock is never silently overwritten.
 */
public class StockAdjustmentRequest {

    @NotNull(message = "Adjustment is required")
    @Min(value = -100000, message = "Adjustment is too small")
    @Max(value = 100000, message = "Adjustment is too large")
    private Integer adjustment;

    public StockAdjustmentRequest() {
    }

    public StockAdjustmentRequest(Integer adjustment) {
        this.adjustment = adjustment;
    }

    public Integer getAdjustment() {
        return adjustment;
    }

    public void setAdjustment(Integer adjustment) {
        this.adjustment = adjustment;
    }
}
