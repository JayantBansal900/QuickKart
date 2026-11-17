package com.quickkart.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AccountAccessService {
    private final JdbcTemplate jdbc;
    public AccountAccessService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public boolean isAllowed(String email, String tokenRole, Long tokenUserId) {
        if (email == null || tokenUserId == null || !("USER".equals(tokenRole) || "ADMIN".equals(tokenRole))) return false;
        return jdbc.query("select id, email_verified, account_status, role from users where email = ?",
                (rs, row) -> tokenUserId.equals(rs.getLong("id")) && rs.getBoolean("email_verified") && "ACTIVE".equals(rs.getString("account_status"))
                        && tokenRole.equals(rs.getString("role")), email).stream().anyMatch(Boolean::booleanValue);
    }
}
