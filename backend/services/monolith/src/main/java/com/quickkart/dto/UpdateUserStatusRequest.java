package com.quickkart.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class UpdateUserStatusRequest {

    @NotBlank(message = "Account status is required")
    @Pattern(regexp = "^(ACTIVE|SUSPENDED|DISABLED|PENDING_VERIFICATION)$", message = "Status must be ACTIVE, SUSPENDED, DISABLED, or PENDING_VERIFICATION")
    private String status;

    public UpdateUserStatusRequest() {
    }

    public UpdateUserStatusRequest(String status) {
        this.status = status;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }
}
