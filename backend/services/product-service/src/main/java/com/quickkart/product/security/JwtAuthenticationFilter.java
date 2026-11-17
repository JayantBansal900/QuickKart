package com.quickkart.product.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final AccountAccessService accounts;
    public JwtAuthenticationFilter(JwtService jwtService, AccountAccessService accounts) {
        this.jwtService = jwtService;
        this.accounts = accounts;
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ") && SecurityContextHolder.getContext().getAuthentication() == null) {
            String jwt = header.substring(7).trim();
            if (jwtService.isTokenValid(jwt)) {
                String email = jwtService.extractEmail(jwt);
                String role = jwtService.extractRole(jwt);
                // Always consult authoritative account state; never cache suspension or roles.
                boolean allowed;
                try { allowed = accounts.isAllowed(email, role, jwtService.extractUserId(jwt)); }
                catch (org.springframework.dao.DataAccessException ex) {
                    response.sendError(503, "Account validation unavailable");
                    return;
                }
                if (allowed) {
                    var auth = new UsernamePasswordAuthenticationToken(email, null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            }
        }
        chain.doFilter(request, response);
    }
}
