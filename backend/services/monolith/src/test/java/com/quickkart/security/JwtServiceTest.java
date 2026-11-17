package com.quickkart.security;

import com.quickkart.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;
    private final String secret = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(secret, 3600000); // 1 hour
    }

    @Test
    void shouldGenerateAndValidateToken() {
        User user = new User(1L, "Jayant", "jayant@example.com", "hashedPassword", "USER");

        String token = jwtService.generateToken(user);

        assertNotNull(token);
        assertFalse(token.isEmpty());
        assertTrue(jwtService.isTokenValid(token));
        assertEquals("jayant@example.com", jwtService.extractEmail(token));
        assertEquals("USER", jwtService.extractRole(token));
        assertEquals(1L, jwtService.extractUserId(token));
        assertFalse(jwtService.isTokenExpired(token));
    }

    @Test
    void shouldRejectTokensSignedWithAnotherKeyAndTokensWithoutExpiration() {
        JwtService other = new JwtService("b3RwLXRlc3Qtb25seS1zZXBhcmF0ZS1rZXktMzItYnl0ZXMtMTIzNA==",3600000);
        User user = new User(1L,"User","user@example.com","hash","USER");
        assertFalse(jwtService.isTokenValid(other.generateToken(user)));
        String noExpiry = io.jsonwebtoken.Jwts.builder().subject("user@example.com")
                .issuedAt(new java.util.Date()).signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                    io.jsonwebtoken.io.Decoders.BASE64.decode(secret))).compact();
        assertFalse(jwtService.isTokenValid(noExpiry));
    }

    @Test
    void shouldRejectInvalidToken() {
        assertFalse(jwtService.isTokenValid("invalid.token.structure"));
        assertFalse(jwtService.isTokenValid(""));
    }

    @Test
    void shouldDetectExpiredToken() {
        // JwtService with 0ms expiration
        JwtService expiredJwtService = new JwtService(secret, -1000);
        User user = new User(1L, "Jayant", "jayant@example.com", "hashedPassword", "USER");

        String expiredToken = expiredJwtService.generateToken(user);

        assertFalse(expiredJwtService.isTokenValid(expiredToken));
        assertTrue(expiredJwtService.isTokenExpired(expiredToken));
    }
}
