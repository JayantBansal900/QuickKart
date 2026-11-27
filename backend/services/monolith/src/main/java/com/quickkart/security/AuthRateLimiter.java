package com.quickkart.security;

import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.HashMap;
import java.util.Map;

@Component
public class AuthRateLimiter {
    private final StringRedisTemplate redis;
    private final boolean local;
    private final Map<String, long[]> windows = new HashMap<>();
    private static final DefaultRedisScript<Long> SCRIPT = new DefaultRedisScript<>(
            "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n", Long.class);
    public AuthRateLimiter(StringRedisTemplate redis, Environment environment) {
        this.redis = redis;
        local = environment.acceptsProfiles(Profiles.of("dev", "test")) && !environment.acceptsProfiles(Profiles.of("prod"));
    }
    public void check(String action, String identity) {
        int limit = switch(action) { case "login" -> 10; case "verify", "reset", "login-verify" -> 10; case "resend", "forgot" -> 3; case "register" -> 5; default -> 60; };
        long seconds = switch(action) { case "register" -> 3600; case "resend", "verify", "forgot", "reset", "login-verify" -> 300; default -> 60; };
        String key;
        try { key = "quickkart:auth:" + action + ":" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.GeneralSecurityException ex) { throw new IllegalStateException(ex); }
        long count;
        if (local) count = incrementLocal(key, seconds);
        else {
            try {
                Long value = redis.execute(SCRIPT, List.of(key), Long.toString(seconds));
                if (value == null) throw new IllegalStateException("No rate-limit result");
                count = value;
            } catch (RuntimeException ex) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Authentication protection unavailable");
            }
        }
        if (count > limit) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts. Try again later.");
    }
    private synchronized long incrementLocal(String key, long seconds) {
        long now = System.currentTimeMillis();
        windows.entrySet().removeIf(entry -> entry.getValue()[1] <= now);
        if (!windows.containsKey(key) && windows.size() >= 10000)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many attempts");
        long[] window = windows.computeIfAbsent(key, ignored -> new long[]{0, now + seconds * 1000});
        return ++window[0];
    }
}
