package com.quickkart.config;

import com.quickkart.entity.User;
import com.quickkart.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@org.springframework.context.annotation.Profile("dev & !prod")
@Component
public class DevAdminInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DevAdminInitializer.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.dev-admin.enabled:false}")
    private boolean devAdminEnabled;

    @Value("${app.dev-admin.name:QuickKart Admin}")
    private String adminName;

    @Value("${app.dev-admin.email:admin@quickkart.com}")
    private String adminEmail;

    @Value("${app.dev-admin.password:}")
    private String adminPassword;

    public DevAdminInitializer(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (!devAdminEnabled) {
            log.info("Development admin initializer is disabled.");
            return;
        }

        if (adminPassword == null || adminPassword.length() < 12) throw new IllegalArgumentException("Explicit development admin password of at least 12 characters required");
        String normalizedEmail = adminEmail.trim().toLowerCase();
        userRepository.findByEmail(normalizedEmail).ifPresentOrElse(
                existingAdmin -> {
                    log.info("Development admin account already exists; preserving its role and status.");
                },
                () -> {
                    User admin = new User(
                            adminName,
                            normalizedEmail,
                            passwordEncoder.encode(adminPassword),
                            "ADMIN",
                            true,
                            "ACTIVE"
                    );
                    userRepository.save(admin);
                    log.info("Seeded development admin account: {}", normalizedEmail);
                }
        );
    }
}
