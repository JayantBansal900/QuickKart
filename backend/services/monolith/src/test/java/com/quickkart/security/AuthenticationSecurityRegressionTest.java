package com.quickkart.security;

import com.quickkart.dto.*;
import com.quickkart.entity.*;
import com.quickkart.repository.*;
import com.quickkart.service.*;
import com.quickkart.exception.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.core.env.Environment;
import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.http.MediaType;

@SpringBootTest
@AutoConfigureMockMvc
class AuthenticationSecurityRegressionTest {
    @Autowired AuthService auth;
    @Autowired UserRepository users;
    @Autowired EmailVerificationRepository challenges;
    @Autowired OtpHasher hasher;
    @Autowired JwtService jwt;
    @Autowired PasswordEncoder passwords;
    @Autowired MockMvc mvc;
    @Autowired DataSource dataSource;
    @Autowired Environment env;
    @MockBean EmailService email;
    private String address;
    private String delivered;
    @BeforeEach void setup() {
        address = UUID.randomUUID() + "@example.com";
        doAnswer(call -> { delivered = call.getArgument(2); return null; }).when(email).sendVerificationOtp(anyString(), anyString(), anyString());
    }
    User account(boolean verified, String status, String role) {
        User u = new User("Customer", address, passwords.encode("password123"), role, verified, status);
        return users.save(u);
    }
    EmailVerification challenge(String code, LocalDateTime expiry) {
        return challenges.save(new EmailVerification(address, hasher.hash(address, code), "REGISTRATION_VERIFICATION", expiry));
    }
    @Test void testDatabaseCannotUseAnExternalDatasource() throws Exception {
        try (var connection=dataSource.getConnection()) {
            assertTrue(connection.getMetaData().getURL().startsWith("jdbc:h2:mem:quickkart_test_"));
        }
    }
    @Test void registrationDoesNotGrantTokenOrAdminAndDeliversNoOtpInResponse() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(
                "{\"name\":\"Customer\",\"email\":\""+address+"\",\"password\":\"password123\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.token").isEmpty())
                .andExpect(jsonPath("$.role").value("USER")).andExpect(jsonPath("$.otp").doesNotExist());
        assertNotNull(delivered);
        assertTrue(passwords.matches("password123",users.findByEmail(address).orElseThrow().getPassword()));
    }
    @Test void unverifiedCustomerCannotLoginOrUseAnExistingJwt() throws Exception {
        User u=account(false,"PENDING_VERIFICATION","USER");
        assertThrows(UnverifiedEmailException.class,()->auth.login(new LoginRequest(address,"password123")));
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+jwt.generateToken(u))).andExpect(status().isUnauthorized());
    }
    @Test void validOtpActivatesAccountAndCannotBeReplayed() {
        account(false,"PENDING_VERIFICATION","USER");
        challenge("123456",LocalDateTime.now().plusMinutes(5));
        AuthResponse response=auth.verifyOtp(new VerifyOtpRequest(address,"123456"));
        assertNotNull(response.getToken()); assertTrue(response.isEmailVerified());
        assertTrue(jwt.isTokenValid(response.getToken()));
        assertThrows(InvalidOtpException.class,()->auth.verifyOtp(new VerifyOtpRequest(address,"123456")));
    }
    @Test void verifiedAdministratorCannotObtainTokenBySubmittingAnyOtp() {
        account(true,"ACTIVE","ADMIN");
        assertThrows(InvalidOtpException.class,()->auth.verifyOtp(new VerifyOtpRequest(address,"000000")));
    }
    @Test void failedAttemptsCommitAcrossTransactionsAndExhaustChallenge() {
        account(false,"PENDING_VERIFICATION","USER");
        var c=challenge("123456",LocalDateTime.now().plusMinutes(5));
        for(int attempt=1;attempt<=5;attempt++) {
            assertThrows(InvalidOtpException.class,()->auth.verifyOtp(new VerifyOtpRequest(address,"999999")));
            assertEquals(attempt,challenges.findById(c.getId()).orElseThrow().getAttempts());
        }
        assertTrue(challenges.findById(c.getId()).orElseThrow().isVerified());
        assertThrows(InvalidOtpException.class,()->auth.verifyOtp(new VerifyOtpRequest(address,"123456")));
    }
    @Test void expiredChallengeIsConsumedWithoutActivatingAccount() {
        account(false,"PENDING_VERIFICATION","USER");
        var c=challenge("123456",LocalDateTime.now().minusSeconds(1));
        assertThrows(OtpExpiredException.class,()->auth.verifyOtp(new VerifyOtpRequest(address,"123456")));
        assertTrue(challenges.findById(c.getId()).orElseThrow().isVerified());
        assertFalse(users.findByEmail(address).orElseThrow().isEmailVerified());
    }
    @Test void resendInvalidatesEveryPreviousChallenge() {
        account(false,"PENDING_VERIFICATION","USER");
        var first=challenge("123456",LocalDateTime.now().plusMinutes(5));
        var second=challenge("654321",LocalDateTime.now().plusMinutes(5));
        auth.resendOtp(new ResendOtpRequest(address));
        assertTrue(challenges.findById(first.getId()).orElseThrow().isVerified());
        assertTrue(challenges.findById(second.getId()).orElseThrow().isVerified());
        var active=challenges.findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(address,"REGISTRATION_VERIFICATION").orElseThrow();
        assertTrue(hasher.matches(address,delivered,active.getOtpHash()));
    }
    @Test void oldUnkeyedOtpHashesAreRejected() {
        account(false,"PENDING_VERIFICATION","USER");
        challenges.save(new EmailVerification(address,"legacy-unkeyed-hash","REGISTRATION_VERIFICATION",LocalDateTime.now().plusMinutes(5)));
        assertThrows(InvalidOtpException.class,()->auth.verifyOtp(new VerifyOtpRequest(address,"123456")));
    }
    @Test void suspensionRejectsLoginAndPreviouslyIssuedToken() throws Exception {
        User u=account(true,"ACTIVE","USER");
        String token=auth.login(new LoginRequest(address,"password123")).getToken();
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        u.setAccountStatus("SUSPENDED"); users.save(u);
        assertThrows(InvalidCredentialsException.class,()->auth.login(new LoginRequest(address,"password123")));
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
    }
    @Test void disabledAccountCannotLoginOrVerify() {
        User u=account(true,"DISABLED","USER");
        assertThrows(InvalidCredentialsException.class,()->auth.login(new LoginRequest(address,"password123")));
        u.setEmailVerified(false);users.save(u);challenge("123456",LocalDateTime.now().plusMinutes(5));
        assertThrows(InvalidOtpException.class,()->auth.verifyOtp(new VerifyOtpRequest(address,"123456")));
    }
    @Test void userAdminBoundariesAndDevControlsAreEnforced() throws Exception {
        User u=account(true,"ACTIVE","USER");
        String userToken=jwt.generateToken(u);
        mvc.perform(get("/api/admin/users").header("Authorization","Bearer "+userToken)).andExpect(status().isForbidden());
        mvc.perform(get("/api/kafka/events").header("Authorization","Bearer "+userToken)).andExpect(status().isNotFound()); // dev endpoint removed
        u.setRole("ADMIN");users.save(u);
        String adminToken=jwt.generateToken(u);
        mvc.perform(get("/api/admin/users").header("Authorization","Bearer "+adminToken)).andExpect(status().isOk());
        mvc.perform(get("/api/kafka/events").header("Authorization","Bearer "+adminToken)).andExpect(status().isNotFound());
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+userToken)).andExpect(status().isUnauthorized());
    }
    @Test void concurrentOtpConsumptionSucceedsExactlyOnce() throws Exception {
        account(false,"PENDING_VERIFICATION","USER");challenge("123456",LocalDateTime.now().plusMinutes(5));
        ExecutorService pool=Executors.newFixedThreadPool(2);
        try {
            CountDownLatch start=new CountDownLatch(1);AtomicInteger success=new AtomicInteger();
            Callable<Void> verify=()->{start.await();try {auth.verifyOtp(new VerifyOtpRequest(address,"123456"));success.incrementAndGet();}catch(InvalidOtpException expected){}return null;};
            Future<Void> a=pool.submit(verify),b=pool.submit(verify);start.countDown();a.get(10,TimeUnit.SECONDS);b.get(10,TimeUnit.SECONDS);
            assertEquals(1,success.get());
        } finally {pool.shutdownNow();}
    }
}
