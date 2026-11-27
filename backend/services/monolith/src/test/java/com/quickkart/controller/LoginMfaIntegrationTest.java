package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.entity.User;
import com.quickkart.repository.UserRepository;
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
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Two-step sign-in: the password, then a 6-digit code emailed to the account (customers and admins). */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.auth.mfa.enabled=true")
class LoginMfaIntegrationTest {

    private static final String PASSWORD = "Str0ng-Passw0rd!";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    /** Mockito mock registered by the test context. */
    @Autowired EmailService emailService;

    User customer;
    User admin;

    @BeforeEach
    void setUp() {
        Mockito.reset(emailService);
        customer = users.saveAndFlush(new User("Mfa Customer", "mfa-" + UUID.randomUUID() + "@example.invalid", encoder.encode(PASSWORD), "USER", true, "ACTIVE"));
        admin = users.saveAndFlush(new User("Mfa Admin", "mfa-admin-" + UUID.randomUUID() + "@example.invalid", encoder.encode(PASSWORD), "ADMIN", true, "ACTIVE"));
    }

    @AfterEach
    void tearDown() {
        Mockito.reset(emailService);
    }

    ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }

    ResultActions verifyCode(String email, String code) throws Exception {
        return mvc.perform(post("/api/auth/login/verify").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "otp", code))));
    }

    /** The email goes out after commit on a background thread. */
    List<String> codesSentTo(String email, int times) {
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(emailService, timeout(3000).times(times)).sendLoginOtp(eq(email), anyString(), code.capture());
        return code.getAllValues();
    }

    static String wrong(String code) {
        return code.equals("000000") ? "111111" : "000000";
    }

    @Test
    void aCorrectPasswordOnlySendsACodeAndTheCodeGivesTheSession() throws Exception {
        login(customer.getEmail(), PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mfaRequired").value(true))
                .andExpect(jsonPath("$.token").value(nullValue()))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("***@example.invalid")));
        String code = codesSentTo(customer.getEmail(), 1).get(0);

        verifyCode(customer.getEmail(), wrong(code)).andExpect(status().is4xxClientError());
        String token = json.readTree(verifyCode(customer.getEmail(), code)
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.role").value("USER"))
                        .andReturn().getResponse().getContentAsString())
                .get("token").asText();
        assertThat(token).isNotBlank();
        mvc.perform(get("/api/user/profile").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        verifyCode(customer.getEmail(), code).andExpect(status().is4xxClientError()); // one-time use
    }

    @Test
    void adminsSignInWithACodeToo() throws Exception {
        login(admin.getEmail(), PASSWORD).andExpect(jsonPath("$.mfaRequired").value(true)).andExpect(jsonPath("$.role").value("ADMIN"));
        String code = codesSentTo(admin.getEmail(), 1).get(0);
        verifyCode(admin.getEmail(), code).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
    }

    @Test
    void aWrongPasswordSendsNoCode() throws Exception {
        login(customer.getEmail(), "Wrong-Passw0rd!").andExpect(status().isUnauthorized());
        verify(emailService, timeout(500).times(0)).sendLoginOtp(anyString(), anyString(), anyString());
        verify(emailService, never()).sendLoginOtp(anyString(), anyString(), anyString());
    }

    @Test
    void onlyTheNewestCodeWorks() throws Exception {
        login(customer.getEmail(), PASSWORD);
        String first = codesSentTo(customer.getEmail(), 1).get(0);
        login(customer.getEmail(), PASSWORD);
        String second = codesSentTo(customer.getEmail(), 2).get(1);
        if (!first.equals(second)) verifyCode(customer.getEmail(), first).andExpect(status().is4xxClientError());
        verifyCode(customer.getEmail(), second).andExpect(status().isOk());
    }

    @Test
    void fiveWrongCodesBurnTheCode() throws Exception {
        login(customer.getEmail(), PASSWORD);
        String code = codesSentTo(customer.getEmail(), 1).get(0);
        for (int i = 0; i < 5; i++) verifyCode(customer.getEmail(), wrong(code)).andExpect(status().is4xxClientError());
        verifyCode(customer.getEmail(), code).andExpect(status().is4xxClientError());
    }

    @Test
    void aCodeCannotBeUsedForAnotherAccount() throws Exception {
        login(customer.getEmail(), PASSWORD);
        String code = codesSentTo(customer.getEmail(), 1).get(0);
        verifyCode(admin.getEmail(), code).andExpect(status().is4xxClientError());
    }
}
