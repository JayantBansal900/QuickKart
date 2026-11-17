package com.quickkart.service;

import com.quickkart.dto.AuthResponse;
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
import org.springframework.transaction.annotation.Transactional;




import java.security.SecureRandom;
import java.time.LocalDateTime;


@Service
public class AuthService {

    private static final String REGISTRATION_PURPOSE = "REGISTRATION_VERIFICATION";
    private static final int OTP_EXPIRY_MINUTES = 5;
    private static final int MAX_OTP_ATTEMPTS = 5;
    private static final String NO_ACTIVE_CHALLENGE =
            "Invalid or expired verification code. Please request a new code.";

    private volatile String timingDummyHash;

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
