package com.quickkart.controller;

import com.quickkart.entity.User;
import com.quickkart.repository.UserRepository;
import com.quickkart.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AdminSystemControllerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired JwtService jwt;

    private String token(String role) {
        User u = users.saveAndFlush(new User("Sys " + role, UUID.randomUUID() + "@example.invalid", "hash", role, true, "ACTIVE"));
        return jwt.generateToken(u);
    }

    @Test
    void adminSeesComponentStatusWithoutInternalDetails() throws Exception {
        String body = mvc.perform(get("/api/admin/system/status").header("Authorization", "Bearer " + token("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.components.length()").value(6))
                .andExpect(jsonPath("$.components[0].name").value("PostgreSQL"))
                .andExpect(jsonPath("$.components[0].status").value("UP"))
                .andReturn().getResponse().getContentAsString();
        String lower = body.toLowerCase();
        for (String forbidden : new String[]{"localhost", "jdbc:", "password", "secret", "exception", ":9092", ":8082"}) {
            assertFalse(lower.contains(forbidden), "status response leaked '" + forbidden + "': " + body);
        }
    }

    @Test
    void customerIsForbidden() throws Exception {
        mvc.perform(get("/api/admin/system/status").header("Authorization", "Bearer " + token("USER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void anonymousIsUnauthorized() throws Exception {
        mvc.perform(get("/api/admin/system/status")).andExpect(status().isUnauthorized());
    }
}
