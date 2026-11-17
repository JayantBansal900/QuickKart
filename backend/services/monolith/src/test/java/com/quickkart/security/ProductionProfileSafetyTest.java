package com.quickkart.security;
import com.quickkart.config.*;
import com.quickkart.controller.*;
import com.quickkart.service.ConsoleEmailService;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Profiles;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;
class ProductionProfileSafetyTest {
    @Test void experimentalBeansCannotBeActivatedByCombiningProdAndDev() {
        var env=new MockEnvironment();env.setActiveProfiles("prod","dev");
        for(Class<?> type:new Class<?>[]{DevAdminInitializer.class,
                ConsoleEmailService.class}) {
            Profile profile=type.getAnnotation(Profile.class);
            assertNotNull(profile);assertFalse(env.acceptsProfiles(Profiles.of(profile.value())),type.getSimpleName());
        }
    }
    @Test void missingSmtpConfigurationFailsBeforeAnyEmailIsSent() {
        var sender=org.mockito.Mockito.mock(org.springframework.mail.javamail.JavaMailSender.class);
        assertThrows(IllegalStateException.class,()->new com.quickkart.service.SmtpEmailService(sender,"support@example.com",new MockEnvironment()));
        org.mockito.Mockito.verifyNoInteractions(sender);
    }
    @Test void weakKeysAndInvalidConfiguredLifetimeFailStartupValidation() {
        assertThrows(io.jsonwebtoken.security.WeakKeyException.class,()->new JwtService("short",3600000).validateConfiguration());
        assertThrows(IllegalArgumentException.class,()->new JwtService("dGVzdC1vbmx5LWtleS0zMi1ieXRlcy1taW5pbXVtLTEyMzQ1Njc4OTA=",0).validateConfiguration());
    }
}
