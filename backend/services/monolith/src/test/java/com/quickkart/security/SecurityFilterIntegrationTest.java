package com.quickkart.security;

import com.quickkart.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@org.springframework.transaction.annotation.Transactional
class SecurityFilterIntegrationTest {
    @Autowired private com.quickkart.repository.UserRepository userRepository;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Test
    void publicEndpointsShouldBeAccessibleWithoutToken() throws Exception {
        mockMvc.perform(get("/api/hello"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("QuickKart backend is running"));

        mockMvc.perform(get("/api/products"))
                .andExpect(status().isOk());
    }

    @Test
    void protectedEndpointShouldRejectUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void protectedEndpointShouldAcceptValidJwtToken() throws Exception {
        User user = new User( "AuthTester", "tester@example.com", "secret", "USER");
        user.setEmailVerified(true); user.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(user);
        String validToken = jwtService.generateToken(user);

        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer " + validToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("tester@example.com"));
    }

    @Test
    void protectedEndpointShouldRejectInvalidToken() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                        .header("Authorization", "Bearer invalid-tampered-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void adminEndpointShouldRejectRegularUser() throws Exception {
        User user = new User( "AuthTester", "tester@example.com", "secret", "USER");
        user.setEmailVerified(true); user.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(user);
        String userToken = jwtService.generateToken(user);

        mockMvc.perform(get("/api/admin/metrics")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403));
    }

    @Test
    void kafkaEndpointsShouldRejectUnauthenticatedRequest() throws Exception {
        mockMvc.perform(get("/api/kafka/status"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        mockMvc.perform(post("/api/kafka/publish-test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderId\":101,\"userId\":1,\"totalAmount\":99.99}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void kafkaEndpointsShouldRejectRegularUser() throws Exception {
        User user = new User( "KafkaTester", "kafka-tester@example.com", "secret", "USER");
        user.setEmailVerified(true); user.setAccountStatus("ACTIVE");
        userRepository.saveAndFlush(user);
        String userToken = jwtService.generateToken(user);

        mockMvc.perform(get("/api/kafka/status")
                        .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/kafka/publish-test")
                        .header("Authorization", "Bearer " + userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderId\":202,\"userId\":10,\"totalAmount\":129.50}"))
                .andExpect(status().isForbidden());
    }
}
