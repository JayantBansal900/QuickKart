package com.quickkart.order.security;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
class JwtConfigurationSafetyTest {
    @Test void invalidConfigurationAndInvalidTokensAreRejected() {
        var service=new JwtService();
        ReflectionTestUtils.setField(service,"secretKey","c2hvcnQ=");
        ReflectionTestUtils.setField(service,"jwtExpiration",3600000L);
        assertThrows(io.jsonwebtoken.security.WeakKeyException.class,service::validateConfiguration);
        ReflectionTestUtils.setField(service,"secretKey","dGVzdC1vbmx5LWtleS0zMi1ieXRlcy1taW5pbXVtLTEyMzQ1Njc4OTA=");
        ReflectionTestUtils.setField(service,"jwtExpiration",0L);
        assertThrows(IllegalArgumentException.class,service::validateConfiguration);
        ReflectionTestUtils.setField(service,"jwtExpiration",3600000L);service.validateConfiguration();
        assertTrue(service.isTokenValid(service.generateToken("user@example.com","USER",1L)));
        assertFalse(service.isTokenValid("bad.token"));
    }
}
