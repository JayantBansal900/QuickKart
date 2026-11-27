package com.quickkart.controller;

import com.quickkart.dto.AuthResponse;
import com.quickkart.dto.ForgotPasswordRequest;
import com.quickkart.dto.ResetPasswordRequest;
import com.quickkart.dto.LoginRequest;
import com.quickkart.dto.RegisterRequest;
import com.quickkart.dto.ResendOtpRequest;
import com.quickkart.dto.VerifyOtpRequest;
import com.quickkart.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    @PostMapping("/verify-otp")
    public ResponseEntity<AuthResponse> verifyOtp(@Valid @RequestBody VerifyOtpRequest request) {
        AuthResponse response = authService.verifyOtp(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/resend-otp")
    public ResponseEntity<Map<String, String>> resendOtp(@Valid @RequestBody ResendOtpRequest request) {
        authService.resendOtp(request);
        return ResponseEntity.ok(Map.of(
                "message", "If this email is awaiting verification, a new code has been sent."
        ));
    }

    /** Always answers the same way, so it can't be used to discover which emails have accounts. */
    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request);
        return ResponseEntity.ok(Map.of(
                "message", "If an account exists for this email, a reset code has been sent."
        ));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ResponseEntity.ok(Map.of(
                "message", "Your password has been reset. Please sign in with your new password."
        ));
    }

    /** Second sign-in step: the code emailed after a correct password. */
    @PostMapping("/login/verify")
    public ResponseEntity<AuthResponse> verifyLogin(@Valid @RequestBody VerifyOtpRequest request) {
        return ResponseEntity.ok(authService.verifyLoginOtp(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return ResponseEntity.ok(Map.of(
                "email", authentication.getName(),
                "authorities", authentication.getAuthorities()
        ));
    }
}
