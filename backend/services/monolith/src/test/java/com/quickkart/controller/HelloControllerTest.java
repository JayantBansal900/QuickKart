package com.quickkart.controller;

import com.quickkart.service.HelloService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(HelloController.class)
@AutoConfigureMockMvc(addFilters = false)
class HelloControllerTest {
    @org.springframework.boot.test.mock.mockito.MockBean private com.quickkart.security.AccountAccessService accounts;
    @org.springframework.boot.test.mock.mockito.MockBean private com.quickkart.security.AuthRateLimiter authLimits;

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private HelloService helloService;

    @MockBean
    private com.quickkart.security.JwtService jwtService;

    @Test
    void shouldReturnHelloMessage() throws Exception {
        when(helloService.getHelloMessage()).thenReturn(Map.of("message", "QuickKart backend is running"));

        mockMvc.perform(get("/api/hello").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.message").value("QuickKart backend is running"));
    }
}
