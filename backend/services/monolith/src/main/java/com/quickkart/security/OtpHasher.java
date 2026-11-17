package com.quickkart.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public class OtpHasher {
    private final byte[] key;
    private final SecureRandom random = new SecureRandom();
    public OtpHasher(@Value("${otp.secret}") String secret) {
        key = Base64.getDecoder().decode(secret);
        if (key.length < 32) throw new IllegalArgumentException("OTP secret must contain at least 32 random bytes (Base64)");
    }
    public static final String REGISTRATION = "REGISTRATION_VERIFICATION";
    public static final String PASSWORD_RESET = "PASSWORD_RESET";

    public String hash(String email, String otp) {
        return hash(REGISTRATION, email, otp);
    }
    public boolean matches(String email, String otp, String stored) {
        return matches(REGISTRATION, email, otp, stored);
    }

    /** The purpose is part of the MAC input, so a sign-up code can never be replayed as a reset code. */
    public String hash(String purpose, String email, String otp) {
        byte[] salt = new byte[16];
        random.nextBytes(salt);
        String nonce = Base64.getEncoder().encodeToString(salt);
        return "v1:" + nonce + ":" + digest(purpose, email, otp, nonce);
    }
    public boolean matches(String purpose, String email, String otp, String stored) {
        if (stored == null || otp == null || !otp.matches("[0-9]{6}")) return false;
        String[] parts = stored.split(":", -1);
        if (parts.length != 3 || !parts[0].equals("v1")) return false;
        return MessageDigest.isEqual(digest(purpose, email, otp, parts[1]).getBytes(StandardCharsets.UTF_8),
                parts[2].getBytes(StandardCharsets.UTF_8));
    }
    private String digest(String purpose, String email, String otp, String nonce) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getEncoder().encodeToString(mac.doFinal(
                    (purpose + "|" + email + "|" + nonce + "|" + otp).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("OTP hashing unavailable", ex);
        }
    }
}
