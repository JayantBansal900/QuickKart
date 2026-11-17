package com.quickkart.service;

import com.quickkart.dto.AuthResponse;
import com.quickkart.dto.LoginRequest;
import com.quickkart.dto.RegisterRequest;
import com.quickkart.dto.VerifyOtpRequest;
import com.quickkart.entity.EmailVerification;
import com.quickkart.entity.User;
import com.quickkart.exception.DuplicateEmailException;
import com.quickkart.exception.InvalidCredentialsException;
import com.quickkart.exception.InvalidOtpException;
import com.quickkart.exception.UnverifiedEmailException;
import com.quickkart.repository.EmailVerificationRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private EmailVerificationRepository emailVerificationRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @Mock
    private EmailService emailService;

    private final com.quickkart.security.OtpHasher hasher = new com.quickkart.security.OtpHasher(
            "b3RwLXRlc3Qtb25seS1zZXBhcmF0ZS1rZXktMzItYnl0ZXMtMTIzNA==");
    @Mock private com.quickkart.security.AuthRateLimiter limiter;
    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepository, emailVerificationRepository, passwordEncoder, jwtService, emailService, hasher, limiter);
    }

    @Test
    void shouldRegisterUserSuccessfullyAndHashPassword() {
        RegisterRequest request = new RegisterRequest("Jayant", "jayant@example.com", "password123");

        when(userRepository.existsByEmail("jayant@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("$2a$10$encodedHash123");

        User savedUser = new User(1L, "Jayant", "jayant@example.com", "$2a$10$encodedHash123", "USER");
        when(userRepository.save(any(User.class))).thenReturn(savedUser);


        AuthResponse response = authService.register(request);

        assertNotNull(response);
        assertNull(response.getToken());
        verifyNoInteractions(jwtService);
        assertEquals(1L, response.getId());
        assertEquals("Jayant", response.getName());
        assertEquals("jayant@example.com", response.getEmail());
        assertEquals("USER", response.getRole());

        // Verify password was hashed before saving
        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        User capturedUser = userCaptor.getValue();
        assertEquals("$2a$10$encodedHash123", capturedUser.getPassword());
        assertNotEquals("password123", capturedUser.getPassword());

        // Verify OTP was saved and email notification was triggered
        verify(emailVerificationRepository).save(any(EmailVerification.class));
        verify(emailService).sendVerificationOtp(eq("jayant@example.com"), eq("Jayant"), anyString());
    }

    @Test
    void shouldThrowDuplicateEmailExceptionWhenEmailExists() {
        RegisterRequest request = new RegisterRequest("Jayant", "jayant@example.com", "password123");

        when(userRepository.existsByEmail("jayant@example.com")).thenReturn(true);

        assertThrows(DuplicateEmailException.class, () -> authService.register(request));
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void shouldLoginSuccessfullyWithValidCredentialsAndVerifiedEmail() {
        LoginRequest request = new LoginRequest("jayant@example.com", "password123");
        User user = new User(1L, "Jayant", "jayant@example.com", "$2a$10$encodedHash123", "USER");
        user.setEmailVerified(true);
        user.setAccountStatus("ACTIVE");

        when(userRepository.findByEmail("jayant@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "$2a$10$encodedHash123")).thenReturn(true);
        when(jwtService.generateToken(user)).thenReturn("valid-jwt-token");

        AuthResponse response = authService.login(request);

        assertNotNull(response);
        assertEquals("valid-jwt-token", response.getToken());
        assertEquals(1L, response.getId());
        assertEquals("Jayant", response.getName());
        assertEquals("jayant@example.com", response.getEmail());
    }

    @Test
    void shouldThrowUnverifiedEmailExceptionWhenEmailNotVerified() {
        LoginRequest request = new LoginRequest("jayant@example.com", "password123");
        User user = new User(1L, "Jayant", "jayant@example.com", "$2a$10$encodedHash123", "USER");
        user.setEmailVerified(false);

        when(userRepository.findByEmail("jayant@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("password123", "$2a$10$encodedHash123")).thenReturn(true);

        assertThrows(UnverifiedEmailException.class, () -> authService.login(request));
        verify(jwtService, never()).generateToken(any(User.class));
    }

    @Test
    void shouldThrowInvalidCredentialsExceptionWhenPasswordMismatch() {
        LoginRequest request = new LoginRequest("jayant@example.com", "wrongPassword");
        User user = new User(1L, "Jayant", "jayant@example.com", "$2a$10$encodedHash123", "USER");

        when(userRepository.findByEmail("jayant@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("wrongPassword", "$2a$10$encodedHash123")).thenReturn(false);

        assertThrows(InvalidCredentialsException.class, () -> authService.login(request));
    }

    @Test
    void shouldThrowInvalidCredentialsExceptionWhenEmailNotFound() {
        LoginRequest request = new LoginRequest("unknown@example.com", "password123");

        when(userRepository.findByEmail("unknown@example.com")).thenReturn(Optional.empty());

        assertThrows(InvalidCredentialsException.class, () -> authService.login(request));
    }

    @Test
    void shouldVerifyOtpSuccessfully() throws Exception {
        String rawOtp = "123456";
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        String hashedOtp = hasher.hash("jayant@example.com", rawOtp);

        User user = new User(1L, "Jayant", "jayant@example.com", "pass", "USER");
        user.setEmailVerified(false);

        EmailVerification verification = new EmailVerification("jayant@example.com", hashedOtp, "REGISTRATION_VERIFICATION", LocalDateTime.now().plusMinutes(5));

        when(userRepository.findByEmailForUpdate("jayant@example.com")).thenReturn(Optional.of(user));
        when(emailVerificationRepository.findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc("jayant@example.com", "REGISTRATION_VERIFICATION"))
                .thenReturn(Optional.of(verification));
        when(userRepository.save(any(User.class))).thenReturn(user);
        when(jwtService.generateToken(any(User.class))).thenReturn("verified-jwt-token");

        AuthResponse response = authService.verifyOtp(new VerifyOtpRequest("jayant@example.com", rawOtp));

        assertNotNull(response);
        assertTrue(response.isEmailVerified());
        assertEquals("verified-jwt-token", response.getToken());
        assertTrue(verification.isVerified());
        assertTrue(user.isEmailVerified());
    }

    @Test
    void shouldRejectInvalidOtp() throws Exception {
        String correctOtp = "123456";
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        String hashedOtp = hasher.hash("jayant@example.com", correctOtp);

        User user = new User(1L, "Jayant", "jayant@example.com", "pass", "USER");
        user.setEmailVerified(false);

        EmailVerification verification = new EmailVerification("jayant@example.com", hashedOtp, "REGISTRATION_VERIFICATION", LocalDateTime.now().plusMinutes(5));

        when(userRepository.findByEmailForUpdate("jayant@example.com")).thenReturn(Optional.of(user));
        when(emailVerificationRepository.findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc("jayant@example.com", "REGISTRATION_VERIFICATION"))
                .thenReturn(Optional.of(verification));

        assertThrows(InvalidOtpException.class, () -> authService.verifyOtp(new VerifyOtpRequest("jayant@example.com", "999999")));
        assertEquals(1, verification.getAttempts());
        assertFalse(verification.isVerified());
    }
}
