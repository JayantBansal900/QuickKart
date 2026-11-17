# Security, JWT Authentication & Role-Based Access Control

QuickKart enforces end-to-end security standards across the entire application stack, including JWT token signing, role-based authorization (RBAC), password hashing, CORS policies, and token revocation.

## 1. Authentication Architecture

QuickKart uses stateless JSON Web Tokens (JWT) signed with HMAC-SHA256.

```
+--------+            +-------------------+            +-------------------+
| Client | ---[1]---> | API Gateway :8080 | ---[2]---> | Monolith Auth     |
+--------+            +-------------------+            | Service :8081     |
    ^                                                  +-------------------+
    |                                                            |
    +----------------------[3] Return JWT Token ------------------+
```

1. **User Credentials**: Client submits email & password to `/api/auth/login`.
2. **Password Verification**: `BCryptPasswordEncoder` verifies raw password against the hashed string in PostgreSQL.
3. **Token Claims**: Upon success, a signed JWT is returned containing:
   - `sub`: User Email (`jane@example.com`)
   - `userId`: User Database ID (`1`)
   - `role`: Granted Authority (`ROLE_USER` or `ROLE_ADMIN`)
   - `iat` / `exp`: Issue time and expiration timestamp (24 hours default TTL).

---

## 2. Role-Based Access Control (RBAC) Matrix

| Endpoint Route | HTTP Method | Granted Roles | Access Level |
|---|---|---|---|
| `/api/auth/register` | POST | Anonymous | Public |
| `/api/auth/login` | POST | Anonymous | Public |
| `/api/products/**` | GET | Anonymous | Public |
| `/api/cart/**` | GET, POST, PUT, DELETE | `ROLE_USER`, `ROLE_ADMIN` | Authenticated |
| `/api/orders/**` | GET, POST | `ROLE_USER`, `ROLE_ADMIN` | Authenticated |
| `/api/payments/**` | POST | `ROLE_USER`, `ROLE_ADMIN` | Authenticated |
| `/api/admin/products/**` | POST, PUT, DELETE | `ROLE_ADMIN` | Admin Only |

### Enforcing Role Security in Spring Security
```java
@Bean
public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
    http
        .csrf(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/auth/**", "/api/products/**", "/actuator/**").permitAll()
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .anyRequest().authenticated()
        )
        .sessionManagement(sess -> sess.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
}
```

---

## 3. Token Revocation & Invalidation

When a user logs out (`POST /api/auth/logout`), the stateless token is revoked by adding its string hash to Redis with an expiration matching the token's remaining TTL.

- **API Gateway Inspection**: Every request routed through the API Gateway checks Redis for `blacklist:<token>`.
- If the token is found in Redis, the Gateway returns HTTP 401 Unauthorized immediately without forwarding the request downstream.

---

## 4. CORS Policy Configuration

CORS is managed at the API Gateway level to allow seamless browser access from the Vite React frontend:
- **Allowed Origins**: `http://localhost:3000`, `http://127.0.0.1:3000`
- **Allowed Methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
- **Allowed Headers**: `Authorization`, `Content-Type`, `X-Requested-With`
- **Allow Credentials**: `true`
