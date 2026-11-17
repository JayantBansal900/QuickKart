package com.quickkart.security;

import com.quickkart.entity.User;
import com.quickkart.repository.EmailVerificationRepository;
import com.quickkart.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Regression tests for the issues found in the November 2026 audit. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuditFixesIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired EmailVerificationRepository verifications;
    @Autowired JwtService jwt;

    User admin;
    String adminToken;

    @BeforeEach
    void setUp() {
        admin = users.saveAndFlush(new User("Audit Admin", unique("admin"), "hash", "ADMIN", true, "ACTIVE"));
        adminToken = jwt.generateToken(admin);
    }

    private static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@example.invalid";
    }

    // ---- account enumeration ----

    @Test
    void verifyOtpForUnknownEmailLooksIdenticalToWrongCodeForRealAccount() throws Exception {
        String unknown = mvc.perform(post("/api/auth/verify-otp").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + unique("nobody") + "\",\"otp\":\"123456\"}"))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();
        assertFalse(unknown.contains("not found"), unknown);
        assertFalse(unknown.contains("@example.invalid"), "response must not echo the email: " + unknown);
    }

    @Test
    void resendForUnknownOrVerifiedEmailReturnsSameGenericSuccessAndSendsNothing() throws Exception {
        String unknownEmail = unique("ghost");
        String body1 = mvc.perform(post("/api/auth/resend-otp").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + unknownEmail + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String body2 = mvc.perform(post("/api/auth/resend-otp").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + admin.getEmail() + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(body1, body2);
        assertTrue(verifications.findAllByEmailAndVerifiedFalse(unknownEmail).isEmpty());
        assertTrue(verifications.findAllByEmailAndVerifiedFalse(admin.getEmail()).isEmpty());
    }

    @Test
    void duplicateRegistrationDoesNotEchoTheEmail() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Dup User\",\"email\":\"" + admin.getEmail() + "\",\"password\":\"Str0ng!Passw0rd\"}"))
                .andExpect(status().isConflict())
                .andExpect(content().string(not(containsString(admin.getEmail()))));
    }

    // ---- admin user-management guard rails ----

    @Test
    void adminCannotSuspendThemselves() throws Exception {
        mvc.perform(patch("/api/admin/users/" + admin.getId() + "/status")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isConflict());
        assertEquals("ACTIVE", users.findById(admin.getId()).orElseThrow().getAccountStatus());
    }

    @Test
    void adminCannotSuspendAnotherAdmin() throws Exception {
        User other = users.saveAndFlush(new User("Other Admin", unique("admin2"), "hash", "ADMIN", true, "ACTIVE"));
        mvc.perform(patch("/api/admin/users/" + other.getId() + "/status")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isConflict());
        assertEquals("ACTIVE", users.findById(other.getId()).orElseThrow().getAccountStatus());
    }

    @Test
    void adminCanStillSuspendACustomer() throws Exception {
        User customer = users.saveAndFlush(new User("Customer", unique("cust"), "hash", "USER", true, "ACTIVE"));
        mvc.perform(patch("/api/admin/users/" + customer.getId() + "/status")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isOk());
        assertEquals("SUSPENDED", users.findById(customer.getId()).orElseThrow().getAccountStatus());
    }

    // ---- analytics ----

    @Test
    void analyticsExposesCollectedRevenue() throws Exception {
        mvc.perform(get("/api/admin/analytics").header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.collectedRevenue").exists())
                .andExpect(jsonPath("$.pendingOrdersCount").exists());
    }

    // ---- per-client IP behind the gateway ----

    @Test
    void clientIpUsesGatewayHeaderOnlyFromInternalPeer() {
        MockHttpServletRequest viaGateway = new MockHttpServletRequest();
        viaGateway.setRemoteAddr("172.18.0.7");
        viaGateway.addHeader("X-Client-IP", "203.0.113.9");
        assertEquals("203.0.113.9", AuthRequestRateLimitFilter.clientIp(viaGateway));

        MockHttpServletRequest spoofed = new MockHttpServletRequest();
        spoofed.setRemoteAddr("198.51.100.20");
        spoofed.addHeader("X-Client-IP", "203.0.113.9");
        assertEquals("198.51.100.20", AuthRequestRateLimitFilter.clientIp(spoofed));

        MockHttpServletRequest garbage = new MockHttpServletRequest();
        garbage.setRemoteAddr("10.0.0.2");
        garbage.addHeader("X-Client-IP", "evil.example.com");
        assertEquals("10.0.0.2", AuthRequestRateLimitFilter.clientIp(garbage));
    }
}
