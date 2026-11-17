package com.quickkart.gateway;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.reactive.server.WebTestClient;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class RouteIntegrationTest {

    @Autowired
    private WebTestClient webTestClient;

    @Test
    void testCorsPreflightForFrontend() {
        webTestClient.options()
                .uri("/api/products")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "GET")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:3000");
    }
    @Test
    void rejectsUnapprovedBrowserOrigin() {
        webTestClient.options().uri("/api/auth/login")
                .header("Origin", "https://unapproved.example")
                .header("Access-Control-Request-Method", "POST")
                .exchange().expectStatus().isForbidden();
    }
}
