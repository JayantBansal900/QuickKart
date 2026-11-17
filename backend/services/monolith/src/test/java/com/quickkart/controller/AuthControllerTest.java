package com.quickkart.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.quickkart.dto.AuthResponse;
import com.quickkart.dto.LoginRequest;
import com.quickkart.dto.RegisterRequest;
import com.quickkart.exception.DuplicateEmailException;
import com.quickkart.exception.InvalidCredentialsException;
import com.quickkart.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(AuthController.class)
@AutoConfigureMockMvc(addFilters = false)
class AuthControllerTest {
    @org.springframework.boot.test.mock.mockito.MockBean private com.quickkart.security.AccountAccessService accounts;
    @org.springframework.boot.test.mock.mockito.MockBean private com.quickkart.security.AuthRateLimiter authLimits;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthService authService;

    @MockBean
    private com.quickkart.security.JwtService jwtService;

    @Test
    void shouldRegisterUserSuccessfully() throws Exception {
        RegisterRequest request = new RegisterRequest("Jayant", "jayant@example.com", "password123");
        AuthResponse response = new AuthResponse(null, 1L, "Jayant", "jayant@example.com", "USER");

        when(authService.register(any(RegisterRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").isEmpty())
                .andExpect(jsonPath("$.id").value(1L))
                .andExpect(jsonPath("$.name").value("Jayant"))
                .andExpect(jsonPath("$.email").value("jayant@example.com"))
                .andExpect(jsonPath("$.role").value("USER"));
    }

    @Test
    void shouldRejectRegisterWithBlankName() throws Exception {
        RegisterRequest request = new RegisterRequest("", "jayant@example.com", "password123");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400));
    }

    @Test
    void shouldRejectRegisterWithInvalidEmail() throws Exception {
        RegisterRequest request = new RegisterRequest("Jayant", "not-an-email", "password123");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldRejectRegisterWithShortPassword() throws Exception {
        RegisterRequest request = new RegisterRequest("Jayant", "jayant@example.com", "123");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void shouldReturn409OnDuplicateEmailRegistration() throws Exception {
        RegisterRequest request = new RegisterRequest("Jayant", "jayant@example.com", "password123");

        when(authService.register(any(RegisterRequest.class)))
                .thenThrow(new DuplicateEmailException("Email is already registered: jayant@example.com"));

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.message").value("Email is already registered: jayant@example.com"));
    }

    @Test
    void shouldLoginSuccessfully() throws Exception {
        LoginRequest request = new LoginRequest("jayant@example.com", "password123");
        AuthResponse response = new AuthResponse("jwt-token-login", 1L, "Jayant", "jayant@example.com", "USER");

        when(authService.login(any(LoginRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("jwt-token-login"))
                .andExpect(jsonPath("$.email").value("jayant@example.com"));
    }

    @Test
    void shouldReturn401OnInvalidLoginCredentials() throws Exception {
        LoginRequest request = new LoginRequest("jayant@example.com", "wrongpassword");

        when(authService.login(any(LoginRequest.class)))
                .thenThrow(new InvalidCredentialsException("Invalid email or password"));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }
}
