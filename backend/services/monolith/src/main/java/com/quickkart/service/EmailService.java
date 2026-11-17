package com.quickkart.service;

public interface EmailService {

    /**
     * Dispatches a 6-digit OTP verification code to the target user.
     *
     * @param toEmail   Recipient email address
     * @param userName  Recipient display name
     * @param otp       The plaintext OTP (only used in-memory for dispatch; never persisted or logged in plain production logs)
     */
    void sendVerificationOtp(String toEmail, String userName, String otp);

    /** Sends the one-time code for resetting a forgotten password. */
    void sendPasswordResetOtp(String toEmail, String userName, String otp);
}
