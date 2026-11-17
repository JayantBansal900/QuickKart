package com.quickkart.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AccountAccessService {
    private final JdbcTemplate jdbc;
    public AccountAccessService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public boolean isAllowed(String email, String tokenRole, Long tokenUserId) {
        return isAllowed(email, tokenRole, tokenUserId, null);
    }

    /**
     * Authoritative per-request account check (never cached): the token's user must still exist,
     * be email-verified and ACTIVE, have the same role, and — when issuedAt is given — the token
     * must not predate the last password change. That last rule is what logs every device out
     * after a password reset, even though JWTs themselves are stateless.
     * (JWT iat has 1-second precision, so the comparison is done in whole seconds.)
     */
    public boolean isAllowed(String email, String tokenRole, Long tokenUserId, java.util.Date issuedAt) {
        if (email == null || tokenUserId == null || !("USER".equals(tokenRole) || "ADMIN".equals(tokenRole))) return false;
        return jdbc.query("select id, email_verified, account_status, role, password_changed_at from users where email = ?",
                (rs, row) -> {
                    if (!tokenUserId.equals(rs.getLong("id")) || !rs.getBoolean("email_verified")
                            || !"ACTIVE".equals(rs.getString("account_status")) || !tokenRole.equals(rs.getString("role"))) return false;
                    java.sql.Timestamp changed = rs.getTimestamp("password_changed_at");
                    if (changed == null || issuedAt == null) return true;
                    return !issuedAt.toInstant().isBefore(changed.toInstant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS));
                }, email).stream().anyMatch(Boolean::booleanValue);
    }
}
