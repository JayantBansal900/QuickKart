package com.quickkart.controller;

import com.quickkart.repository.UserRepository;
import com.quickkart.service.EmailService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mail.MailSendException;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** If the OTP email can't be sent, sign-up fails cleanly (503) and leaves no half-created account. */
@SpringBootTest
@AutoConfigureMockMvc
class RegistrationEmailFailureTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    /** The test context registers a Mockito mock as the EmailService (IsolatedDatabaseContextCustomizerFactory). */
    @Autowired EmailService emailService;

    @AfterEach
    void resetMock() {
        Mockito.reset(emailService);
    }

    @Test
    void smtpFailureReturns503AndRollsBackTheUser() throws Exception {
        doThrow(new MailSendException("535 Authentication failed for user secret@example.invalid"))
                .when(emailService).sendVerificationOtp(anyString(), anyString(), anyString());
        String email = "mailfail-" + UUID.randomUUID() + "@example.invalid";

        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Mail Fail\",\"email\":\"" + email + "\",\"password\":\"Str0ng!Passw0rd\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value(containsString("try again")))
                // provider error details (which can include account names) are never returned
                .andExpect(content().string(not(containsString("535"))));

        assertFalse(users.existsByEmail(email), "registration must roll back when the email can't be sent");
    }
}
