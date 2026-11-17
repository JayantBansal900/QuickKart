package com.quickkart.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;

@Component
public class AuthRequestRateLimitFilter extends OncePerRequestFilter {

    /** Set by the API gateway's ClientIpFilter; see that class for the trust rule. */
    static final String CLIENT_IP_HEADER = "X-Client-IP";

    private final AuthRateLimiter limiter;

    public AuthRequestRateLimitFilter(AuthRateLimiter limiter) {
        this.limiter = limiter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if ("POST".equals(request.getMethod()) && request.getRequestURI().startsWith("/api/auth/")) {
            try {
                limiter.check("ip", clientIp(request));
            } catch (ResponseStatusException ex) {
                response.setStatus(ex.getStatusCode().value());
                response.setContentType("application/json");
                response.getWriter().write("{\"message\":\"Authentication request limit exceeded or protection unavailable\"}");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    /**
     * Behind the gateway every request has the gateway's IP as remote address, which would make
     * the per-IP limit a single global bucket. Trust the gateway's X-Client-IP header only when the
     * request came from an internal (private/loopback) address, i.e. from the gateway itself.
     */
    static String clientIp(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        String forwarded = request.getHeader(CLIENT_IP_HEADER);
        if (forwarded != null && forwarded.matches("[0-9a-fA-F:.]{2,45}") && isInternal(remote)) {
            return forwarded;
        }
        return remote;
    }

    private static boolean isInternal(String ip) {
        if (ip == null || !ip.matches("[0-9a-fA-F:.]{2,45}")) return false;
        try {
            InetAddress address = InetAddress.getByName(ip); // literal IP only, no DNS lookup
            return address.isLoopbackAddress() || address.isSiteLocalAddress();
        } catch (UnknownHostException ex) {
            return false;
        }
    }
}
