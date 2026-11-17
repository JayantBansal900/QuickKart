package com.quickkart.service;

import com.quickkart.dto.AuthResponse;
import com.quickkart.dto.ForgotPasswordRequest;
import com.quickkart.dto.ResetPasswordRequest;
import com.quickkart.dto.LoginRequest;
import com.quickkart.dto.RegisterRequest;
import com.quickkart.dto.ResendOtpRequest;
import com.quickkart.dto.VerifyOtpRequest;
import com.quickkart.entity.EmailVerification;
import com.quickkart.entity.User;
import com.quickkart.exception.DuplicateEmailException;
import com.quickkart.exception.InvalidCredentialsException;
import com.quickkart.exception.InvalidOtpException;
import com.quickkart.exception.MaxOtpAttemptsExceededException;
import com.quickkart.exception.OtpExpiredException;
import com.quickkart.exception.UnverifiedEmailException;
import com.quickkart.repository.EmailVerificationRepository;
import com.quickkart.repository.UserRepository;
import com.quickkart.security.JwtService;
import com.quickkart.security.OtpHasher;
import com.quickkart.security.AuthRateLimiter;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.core.task.TaskExecutor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;




import java.security.SecureRandom;
import java.time.LocalDateTime;


@Service
public class AuthService {

    private static final String REGISTRATION_PURPOSE = OtpHasher.REGISTRATION;
    private static final String RESET_PURPOSE = OtpHasher.PASSWORD_RESET;
    private static final int OTP_EXPIRY_MINUTES = 5;
    private static final int MAX_OTP_ATTEMPTS = 5;
    private static final String NO_ACTIVE_CHALLENGE =
            "Invalid or expired verification code. Please request a new code.";

    private volatile String timingDummyHash;

    /** Spring Boot's shared task executor; null in plain unit tests, where mail is sent inline. */
    private TaskExecutor mailExecutor;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setMailExecutor(@org.springframework.beans.factory.annotation.Qualifier("applicationTaskExecutor") TaskExecutor mailExecutor) {
        this.mailExecutor = mailExecutor;
    }

    private final UserRepository userRepository;
    private final EmailVerificationRepository emailVerificationRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailService emailService;
    private final OtpHasher otpHasher;
    private final AuthRateLimiter rateLimiter;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(UserRepository userRepository,
                       EmailVerificationRepository emailVerificationRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService,
                       EmailService emailService, OtpHasher otpHasher, AuthRateLimiter rateLimiter) {
        this.userRepository = userRepository;
        this.emailVerificationRepository = emailVerificationRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.emailService = emailService;
        this.otpHasher = otpHasher;
        this.rateLimiter = rateLimiter;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (request == null || request.getEmail() == null || request.getName() == null || request.getPassword() == null) {
            throw new IllegalArgumentException("Name, email, and password must not be null");
        }

        String normalizedEmail = request.getEmail().trim().toLowerCase(java.util.Locale.ROOT);

        // Rate-limit BEFORE the existence check so the duplicate response can't be used
        // as an unlimited "is this email registered?" oracle.
        rateLimiter.check("register", normalizedEmail);

        if (userRepository.existsByEmail(normalizedEmail)) {
            // Trade-off: a 409 still reveals that the account exists (needed for a usable signup UX),
            // but it is rate-limited and no longer echoes the address back.
            throw new DuplicateEmailException("An account with this email already exists. Please sign in.");
        }
        String hashedPassword = passwordEncoder.encode(request.getPassword());

        User user = new User(
                request.getName().trim(),
                normalizedEmail,
                hashedPassword,
                "USER"
        );
        if (request.getPhoneNumber() != null && !request.getPhoneNumber().isBlank()) {
            user.setPhoneNumber(request.getPhoneNumber().trim());
        }

        User savedUser = userRepository.save(user);

        // Generate and dispatch OTP
        generateAndSendOtp(savedUser.getEmail(), savedUser.getName());

        String token = null; // Registration never grants protected API access.

        return new AuthResponse(
                token,
                savedUser.getId(),
                savedUser.getName(),
                savedUser.getEmail(),
                savedUser.getRole(),
                savedUser.isEmailVerified(),
                savedUser.getAccountStatus(),
                "Registration successful. A 6-digit verification code has been dispatched to your email."
        );
    }

    @Transactional(noRollbackFor = {InvalidOtpException.class, OtpExpiredException.class, MaxOtpAttemptsExceededException.class})
    public AuthResponse verifyOtp(VerifyOtpRequest request) {
        if (request == null || request.getEmail() == null || request.getOtp() == null) {
            throw new IllegalArgumentException("Email and OTP must not be null");
        }

        String normalizedEmail = request.getEmail().trim().toLowerCase(java.util.Locale.ROOT);

        rateLimiter.check("verify", normalizedEmail);
        // Unknown email, already-verified account and missing challenge all return the SAME error,
        // so this endpoint cannot be used to discover which emails are registered.
        User user = userRepository.findByEmailForUpdate(normalizedEmail)
                .orElseThrow(() -> new InvalidOtpException(NO_ACTIVE_CHALLENGE));

        if (user.isEmailVerified() || !"PENDING_VERIFICATION".equals(user.getAccountStatus())) {
            throw new InvalidOtpException(NO_ACTIVE_CHALLENGE);
        }

        EmailVerification verification = emailVerificationRepository
                .findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(normalizedEmail, REGISTRATION_PURPOSE)
                .orElseThrow(() -> new InvalidOtpException(NO_ACTIVE_CHALLENGE));

        if (verification.getAttempts() >= MAX_OTP_ATTEMPTS) {
            throw new MaxOtpAttemptsExceededException("Maximum verification attempts (" + MAX_OTP_ATTEMPTS + ") reached. Please request a new OTP code.");
        }

        verification.setAttempts(verification.getAttempts() + 1);
        emailVerificationRepository.save(verification);

        if (!verification.getExpiryAt().isAfter(LocalDateTime.now())) {
            verification.setVerified(true); // Consumed/invalidated, never reusable.
            throw new OtpExpiredException("Verification code has expired. Please request a new OTP code.");
        }

        if (!otpHasher.matches(normalizedEmail, request.getOtp(), verification.getOtpHash())) {
            if (verification.getAttempts() >= MAX_OTP_ATTEMPTS) verification.setVerified(true);
            int remaining = MAX_OTP_ATTEMPTS - verification.getAttempts();
            throw new InvalidOtpException("Invalid verification code. " + (remaining > 0 ? remaining + " attempt(s) remaining." : "Please request a new code."));
        }

        // Verification successful
        verification.setVerified(true);
        emailVerificationRepository.save(verification);

        user.setEmailVerified(true);
        user.setAccountStatus("ACTIVE");
        user.setUpdatedAt(LocalDateTime.now());
        User updatedUser = userRepository.save(user);

        String token = jwtService.generateToken(updatedUser);

        return new AuthResponse(
                token,
                updatedUser.getId(),
                updatedUser.getName(),
                updatedUser.getEmail(),
                updatedUser.getRole(),
                true,
                "ACTIVE",
                "Email successfully verified. Your QuickKart account is now active!"
        );
    }

    @Transactional
    public void resendOtp(ResendOtpRequest request) {
        if (request == null || request.getEmail() == null) {
            throw new IllegalArgumentException("Email must not be null");
        }

        String normalizedEmail = request.getEmail().trim().toLowerCase(java.util.Locale.ROOT);

        rateLimiter.check("resend", normalizedEmail);
        // Always answer with the same generic success message (see controller). A code is only
        // generated for an account that is genuinely awaiting verification.
        userRepository.findByEmailForUpdate(normalizedEmail)
                .filter(user -> !user.isEmailVerified() && "PENDING_VERIFICATION".equals(user.getAccountStatus()))
                .ifPresent(user -> generateAndSendOtp(user.getEmail(), user.getName()));
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        rateLimiter.check("login", request.getEmail().trim().toLowerCase(java.util.Locale.ROOT));
        String normalizedEmail = request.getEmail().trim().toLowerCase(java.util.Locale.ROOT);

        User user = userRepository.findByEmail(normalizedEmail).orElse(null);
        if (user == null) {
            // Spend the same BCrypt time as a real check so response timing doesn't reveal
            // whether the email exists.
            passwordEncoder.matches(request.getPassword(), timingDummyHash());
            throw new InvalidCredentialsException("Invalid email or password");
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new InvalidCredentialsException("Invalid email or password");
        }

        if (!user.isEmailVerified()) {
            throw new UnverifiedEmailException("Your email address is not verified. Please verify your email using the OTP sent to your inbox.");
        }

        if (!"ACTIVE".equals(user.getAccountStatus()) ||
                !("USER".equals(user.getRole()) || "ADMIN".equals(user.getRole()))) {
            throw new InvalidCredentialsException("Account is not active");
        }
        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        String token = jwtService.generateToken(user);

        return new AuthResponse(
                token,
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole(),
                user.isEmailVerified(),
                user.getAccountStatus(),
                "Authentication successful"
        );
    }

    private String timingDummyHash() {
        if (timingDummyHash == null) {
            timingDummyHash = passwordEncoder.encode("timing-equalisation-" + secureRandom.nextLong());
        }
        return timingDummyHash;
    }

    // ------------------------------------------------------------------ password reset

    /**
     * Sends a reset code if — and only if — the email belongs to an active, verified account.
     * The caller always gets the same response, so this can't be used to discover accounts.
     */
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase(java.util.Locale.ROOT);
        rateLimiter.check("forgot", normalizedEmail);
        userRepository.findByEmailForUpdate(normalizedEmail)
                .filter(user -> user.isEmailVerified() && "ACTIVE".equals(user.getAccountStatus()))
                .ifPresent(user -> {
                    String rawOtp = String.format("%06d", secureRandom.nextInt(1_000_000));
                    // Only the newest reset code is valid.
                    emailVerificationRepository.findAllByEmailAndPurposeAndVerifiedFalse(normalizedEmail, RESET_PURPOSE)
                            .forEach(previous -> previous.setVerified(true));
                    emailVerificationRepository.save(new EmailVerification(
                            normalizedEmail,
                            otpHasher.hash(RESET_PURPOSE, normalizedEmail, rawOtp),
                            RESET_PURPOSE,
                            LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES)));
                    sendAfterCommit(() -> emailService.sendPasswordResetOtp(normalizedEmail, user.getName(), rawOtp));
                });
    }

    /**
     * Verifies the reset code (same 5-attempt / 5-minute rules as sign-up) and sets the new password.
     * passwordChangedAt is updated, which makes every JWT issued before now invalid in all services.
     */
    @Transactional(noRollbackFor = {InvalidOtpException.class, OtpExpiredException.class, MaxOtpAttemptsExceededException.class})
    public void resetPassword(ResetPasswordRequest request) {
        String normalizedEmail = request.getEmail().trim().toLowerCase(java.util.Locale.ROOT);
        rateLimiter.check("reset", normalizedEmail);

        User user = userRepository.findByEmailForUpdate(normalizedEmail)
                .filter(u -> u.isEmailVerified() && "ACTIVE".equals(u.getAccountStatus()))
                .orElseThrow(() -> new InvalidOtpException(NO_ACTIVE_CHALLENGE));
        EmailVerification challenge = emailVerificationRepository
                .findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(normalizedEmail, RESET_PURPOSE)
                .orElseThrow(() -> new InvalidOtpException(NO_ACTIVE_CHALLENGE));

        if (challenge.getAttempts() >= MAX_OTP_ATTEMPTS) {
            challenge.setVerified(true);
            throw new MaxOtpAttemptsExceededException("Too many incorrect codes. Please request a new reset code.");
        }
        challenge.setAttempts(challenge.getAttempts() + 1);
        if (!challenge.getExpiryAt().isAfter(LocalDateTime.now())) {
            challenge.setVerified(true);
            throw new OtpExpiredException("This reset code has expired. Please request a new one.");
        }
        if (!otpHasher.matches(RESET_PURPOSE, normalizedEmail, request.getOtp(), challenge.getOtpHash())) {
            if (challenge.getAttempts() >= MAX_OTP_ATTEMPTS) challenge.setVerified(true);
            int remaining = MAX_OTP_ATTEMPTS - challenge.getAttempts();
            throw new InvalidOtpException("Invalid reset code. " + (remaining > 0 ? remaining + " attempt(s) remaining." : "Please request a new code."));
        }

        challenge.setVerified(true); // one-time use
        LocalDateTime now = LocalDateTime.now();
        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        user.setPasswordChangedAt(now);
        user.setUpdatedAt(now);
        userRepository.save(user);
    }

    /**
     * Sends mail only after the transaction commits, on a background thread. For forgot-password this
     * matters for security, not just speed: a ~5 s SMTP call that happens only for real accounts would
     * let anyone detect registered emails by response time. A send failure is logged, never surfaced.
     */
    private void sendAfterCommit(Runnable send) {
        Runnable safeSend = () -> {
            try {
                send.run();
            } catch (RuntimeException ex) {
                org.slf4j.LoggerFactory.getLogger(AuthService.class)
                        .warn("Password reset email could not be sent ({})", ex.getClass().getSimpleName());
            }
        };
        Runnable dispatch = () -> {
            if (mailExecutor != null) mailExecutor.execute(safeSend); else safeSend.run();
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch.run();
                }
            });
        } else {
            dispatch.run();
        }
    }

    private void generateAndSendOtp(String email, String name) {
        String rawOtp = String.format("%06d", secureRandom.nextInt(1_000_000));
        String hashedOtp = otpHasher.hash(email, rawOtp);
        // Invalidate all previous challenges; old/legacy hashes cannot be used.
        emailVerificationRepository.findAllByEmailAndVerifiedFalse(email).forEach(previous -> {
            previous.setVerified(true);
            emailVerificationRepository.save(previous);
        });
        LocalDateTime expiry = LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES);

        EmailVerification verification = new EmailVerification(
                email,
                hashedOtp,
                REGISTRATION_PURPOSE,
                expiry
        );
        emailVerificationRepository.save(verification);

        emailService.sendVerificationOtp(email, name, rawOtp);
    }

}
