package com.quickkart.order.dto;

import jakarta.validation.constraints.NotBlank;

public class UpdateOrderStatusRequest {

    @NotBlank(message = "Status must not be blank")
    private String status;
    /** Required when status is SHIPPED (dispatch). */
    private String courier;
    private String trackingNumber;
    public String getCourier() { return courier; }
    public void setCourier(String courier) { this.courier = courier; }
    public String getTrackingNumber() { return trackingNumber; }
    public void setTrackingNumber(String trackingNumber) { this.trackingNumber = trackingNumber; }

    public UpdateOrderStatusRequest() {
    }

    public UpdateOrderStatusRequest(String status) {
        this.status = status;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
