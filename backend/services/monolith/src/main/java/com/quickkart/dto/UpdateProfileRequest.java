package com.quickkart.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class UpdateProfileRequest {

    @NotBlank(message = "Name cannot be blank")
    @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
    private String name;

    @Size(max = 30, message = "Phone number must be at most 30 characters")
    private String phoneNumber;

    /** Optional. null leaves the saved address unchanged; an empty string removes it. */
    @Size(max = 1000, message = "Address must be at most 1000 characters")
    private String savedAddress;

    public String getSavedAddress() { return savedAddress; }
    public void setSavedAddress(String savedAddress) { this.savedAddress = savedAddress; }

    public UpdateProfileRequest() {
    }

    public UpdateProfileRequest(String name, String phoneNumber) {
        this.name = name;
        this.phoneNumber = phoneNumber;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }
}
