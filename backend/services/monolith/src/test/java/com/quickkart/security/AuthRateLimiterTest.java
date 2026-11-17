package com.quickkart.security;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class AuthRateLimiterTest {
    @Test void accountLimitsApplyAndDoNotDependOnClientCooldown() {
        var redis=mock(StringRedisTemplate.class);var env=new MockEnvironment();env.setActiveProfiles("test");
        var limiter=new AuthRateLimiter(redis,env);
        for(int i=0;i<3;i++)limiter.check("resend","a@example.com");
        assertEquals(429,assertThrows(ResponseStatusException.class,()->limiter.check("resend","a@example.com")).getStatusCode().value());
        limiter.check("resend","b@example.com");verifyNoInteractions(redis);
    }
    @Test void productionNeverFallsBackToMemoryWhenRedisFails() {
        var env=new MockEnvironment();env.setActiveProfiles("prod","dev");
        var limiter=new AuthRateLimiter(mock(StringRedisTemplate.class),env);
        assertEquals(503,assertThrows(ResponseStatusException.class,()->limiter.check("login","a@example.com")).getStatusCode().value());
    }
}
