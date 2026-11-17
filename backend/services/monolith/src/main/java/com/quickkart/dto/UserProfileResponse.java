package com.quickkart.dto;

import com.quickkart.entity.User;
import java.time.LocalDateTime;

public class UserProfileResponse {

    private Long id;
    private String name;
    private String email;
    private String phoneNumber;
    private String role;
    private boolean emailVerified;
    private String accountStatus;
    private LocalDateTime createdAt;

    public UserProfileResponse() {
    }

    public UserProfileResponse(Long id, String name, String email, String phoneNumber, String role, boolean emailVerified, String accountStatus, LocalDateTime createdAt) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.phoneNumber = phoneNumber;
        this.role = role;
        this.emailVerified = emailVerified;
        this.accountStatus = accountStatus;
        this.createdAt = createdAt;
    }

    public static UserProfileResponse fromEntity(User user) {
        if (user == null) return null;
        return new UserProfileResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPhoneNumber(),
                user.getRole(),
                user.isEmailVerified(),
                user.getAccountStatus(),
                user.getCreatedAt()
        ).withSavedAddress(user.getSavedAddress());
    }

    private String savedAddress;

    public String getSavedAddress() { return savedAddress; }
    public void setSavedAddress(String savedAddress) { this.savedAddress = savedAddress; }

    private UserProfileResponse withSavedAddress(String address) {
        this.savedAddress = address;
        return this;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public void setEmailVerified(boolean emailVerified) {
        this.emailVerified = emailVerified;
    }

    public String getAccountStatus() {
        return accountStatus;
    }

    public void setAccountStatus(String accountStatus) {
        this.accountStatus = accountStatus;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
