package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.entity.User;
import com.quickkart.repository.EmailVerificationRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.security.JwtService;
import com.quickkart.security.OtpHasher;
import com.quickkart.service.EmailService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class PasswordResetIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired EmailVerificationRepository verifications;
    @Autowired PasswordEncoder encoder;
    @Autowired JwtService jwt;
    @Autowired OtpHasher hasher;
    /** Mockito mock registered by the test context (IsolatedDatabaseContextCustomizerFactory). */
    @Autowired EmailService emailService;

    private User user;
    private static final String OLD_PASSWORD = "Old-Passw0rd!";
    private static final String NEW_PASSWORD = "New-Passw0rd!";

    @BeforeEach
    void setUp() {
        Mockito.reset(emailService);
        User u = new User("Reset Tester", "reset-" + UUID.randomUUID() + "@example.invalid", encoder.encode(OLD_PASSWORD), "USER", true, "ACTIVE");
        user = users.saveAndFlush(u);
    }

    @AfterEach
    void resetMock() {
        Mockito.reset(emailService);
    }

    private String body(Object o) throws Exception {
        return json.writeValueAsString(o);
    }

    private void forgot(String email) throws Exception {
        mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("email", email))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("If an account exists for this email, a reset code has been sent."));
    }

    /** The email is sent after commit on a background thread, so wait for it. */
    private String capturedResetCode() {
        ArgumentCaptor<String> otp = ArgumentCaptor.forClass(String.class);
        verify(emailService, timeout(3000)).sendPasswordResetOtp(eq(user.getEmail()), anyString(), otp.capture());
        return otp.getValue();
    }

    private int reset(String otp, String password) throws Exception {
        return mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("email", user.getEmail(), "otp", otp, "newPassword", password))))
                .andReturn().getResponse().getStatus();
    }

    private int login(String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("email", user.getEmail(), "password", password))))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void unknownEmailGetsTheSameAnswerAndNoEmail() throws Exception {
        forgot("nobody-" + UUID.randomUUID() + "@example.invalid");
        verify(emailService, after(500).never()).sendPasswordResetOtp(anyString(), anyString(), anyString());
    }

    @Test
    void slowEmailProviderDoesNotSlowTheResponse() throws Exception {
        // If the 5 s SMTP call happened inline only for real accounts, response time would reveal them.
        doAnswer(inv -> { Thread.sleep(1500); return null; })
                .when(emailService).sendPasswordResetOtp(anyString(), anyString(), anyString());
        long start = System.nanoTime();
        forgot(user.getEmail());
        long ms = (System.nanoTime() - start) / 1_000_000;
        assertTrue(ms < 1000, "forgot-password waited for the email: " + ms + " ms");
        capturedResetCode();
    }

    @Test
    void fullResetFlowChangesPasswordAndRevokesOldSessions() throws Exception {
        String oldToken = jwt.generateToken(user);
        mvc.perform(get("/api/user/profile").header("Authorization", "Bearer " + oldToken)).andExpect(status().isOk());

        Thread.sleep(1100); // the new password must be set in a later second than the old token's iat
        forgot(user.getEmail());
        String code = capturedResetCode();

        String wrong = code.equals("000000") ? "111111" : "000000";
        assertEquals(400, reset(wrong, NEW_PASSWORD));
        assertEquals(200, reset(code, NEW_PASSWORD));
        assertEquals(400, reset(code, "Another-Passw0rd!"), "a reset code is single-use");

        assertEquals(401, login(OLD_PASSWORD));
        assertEquals(200, login(NEW_PASSWORD));

        // Every token issued before the reset is now rejected, everywhere it is checked.
        mvc.perform(get("/api/user/profile").header("Authorization", "Bearer " + oldToken)).andExpect(status().isUnauthorized());
        String newToken = jwt.generateToken(users.findById(user.getId()).orElseThrow());
        mvc.perform(get("/api/user/profile").header("Authorization", "Bearer " + newToken)).andExpect(status().isOk());
    }

    @Test
    void aSignUpCodeCannotBeUsedAsAResetCode() {
        String hash = hasher.hash(OtpHasher.REGISTRATION, user.getEmail(), "123456");
        assertTrue(hasher.matches(OtpHasher.REGISTRATION, user.getEmail(), "123456", hash));
        assertFalse(hasher.matches(OtpHasher.PASSWORD_RESET, user.getEmail(), "123456", hash));
    }

    @Test
    void resetIsRefusedForUnverifiedOrSuspendedAccounts() throws Exception {
        user.setAccountStatus("SUSPENDED");
        users.saveAndFlush(user);
        forgot(user.getEmail());
        verify(emailService, after(500).never()).sendPasswordResetOtp(anyString(), anyString(), anyString());
        assertEquals(400, reset("123456", NEW_PASSWORD));
    }

    @Test
    void newPasswordIsValidated() throws Exception {
        assertEquals(400, reset("123456", "123"));
        assertEquals(400, reset("12ab56", NEW_PASSWORD));
    }
}
