package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.RegisterRequest;
import com.quickkart.dto.UpdateUserStatusRequest;
import com.quickkart.dto.VerifyOtpRequest;
import com.quickkart.entity.EmailVerification;
import com.quickkart.entity.User;
import com.quickkart.repository.EmailVerificationRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OtpAndAdminUserSecurityIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired private com.quickkart.security.OtpHasher otpHasher;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EmailVerificationRepository emailVerificationRepository;

    @Autowired
    private JwtService jwtService;

    private User adminUser;
    private User customerUser;
    private String adminToken;
    private String customerToken;

    @BeforeEach
    void setUp() {
        adminUser = userRepository.findByEmail("admin_test_suite@quickkart.com")
                .orElseGet(() -> {
                    User u = new User("Suite Admin", "admin_test_suite@quickkart.com", "hash", "ADMIN", true, "ACTIVE");
                    return userRepository.save(u);
                });

        customerUser = userRepository.findByEmail("customer_test_suite@quickkart.com")
                .orElseGet(() -> {
                    User u = new User("Suite Customer", "customer_test_suite@quickkart.com", "hash", "USER", true, "ACTIVE");
                    return userRepository.save(u);
                });

        adminUser.setEmailVerified(true); adminUser.setAccountStatus("ACTIVE");

        userRepository.saveAndFlush(adminUser);

        adminToken = jwtService.generateToken(adminUser);
        customerUser.setEmailVerified(true); customerUser.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(customerUser);
        customerToken = jwtService.generateToken(customerUser);
    }

    @Test
    void customerCannotAccessAdminUsersApi_ReturnsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/users")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedCannotAccessAdminUsersApi_ReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminCanAccessAdminUsersApi_ReturnsSanitizedUserListWithoutPasswords() throws Exception {
        mockMvc.perform(get("/api/admin/users")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].password").doesNotExist())
                .andExpect(jsonPath("$[0].otpHash").doesNotExist())
                .andExpect(jsonPath("$[0].email").exists())
                .andExpect(jsonPath("$[0].role").exists());
    }

    @Test
    void adminCanAccessAnalyticsApi_ReturnsRealMetrics() throws Exception {
        mockMvc.perform(get("/api/admin/analytics")
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalProducts").isNumber())
                .andExpect(jsonPath("$.totalOrders").isNumber())
                .andExpect(jsonPath("$.totalUsers").isNumber())
                .andExpect(jsonPath("$.totalRevenue").isNumber());
    }

    @Test
    void customerCannotAccessAnalyticsApi_ReturnsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/analytics")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void customerCanAccessAndEditOwnProfile() throws Exception {
        mockMvc.perform(get("/api/user/profile")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("customer_test_suite@quickkart.com"));

        mockMvc.perform(put("/api/user/profile")
                        .header("Authorization", "Bearer " + customerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", "Updated Customer Name",
                                "phoneNumber", "+919876543210"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Customer Name"))
                .andExpect(jsonPath("$.phoneNumber").value("+919876543210"));
    }

    @Test
    void registrationTriggersOtpAndVerificationFlow() throws Exception {
        String testEmail = "otp_new_user@example.com";
        RegisterRequest registerReq = new RegisterRequest("OTP User", testEmail, "securePassword123", "+919123456789");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(registerReq)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.emailVerified").value(false))
                .andExpect(jsonPath("$.accountStatus").value("PENDING_VERIFICATION"));

        // Verify that OTP verification record was created in database
        EmailVerification verification = emailVerificationRepository
                .findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(testEmail, "REGISTRATION_VERIFICATION")
                .orElseThrow();
        assertNotNull(verification);
        assertFalse(verification.isVerified());
        assertNotNull(verification.getOtpHash());

        // Attempt verify with wrong OTP -> fails with 400 Bad Request
        mockMvc.perform(post("/api/auth/verify-otp")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new VerifyOtpRequest(testEmail, "000000"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));

        // Re-read updated verification record with hash and test with mock hash
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        String knownOtp = "778899";
        String knownHash = otpHasher.hash(testEmail, knownOtp);
        verification.setOtpHash(knownHash);
        emailVerificationRepository.save(verification);

        // Verify with correct OTP -> succeeds with 200 OK and activates account
        mockMvc.perform(post("/api/auth/verify-otp")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new VerifyOtpRequest(testEmail, knownOtp))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.emailVerified").value(true))
                .andExpect(jsonPath("$.accountStatus").value("ACTIVE"));

        // Verify user in DB is now active
        User verifiedUser = userRepository.findByEmail(testEmail).orElseThrow();
        assertTrue(verifiedUser.isEmailVerified());
        assertEquals("ACTIVE", verifiedUser.getAccountStatus());
    }
}
