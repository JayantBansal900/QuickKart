package com.quickkart.config;
import com.quickkart.entity.User;
import com.quickkart.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class DevAdminSafetyTest {
    @Test void disabledBootstrapCannotTouchAccounts() {
        var repository=mock(UserRepository.class);var encoder=mock(PasswordEncoder.class);
        var initializer=new DevAdminInitializer(repository,encoder);
        ReflectionTestUtils.setField(initializer,"devAdminEnabled",false);
        initializer.run();verifyNoInteractions(repository,encoder);
    }
    @Test void existingUserIsNeverPromotedReactivatedOrOverwritten() {
        var repository=mock(UserRepository.class);var encoder=mock(PasswordEncoder.class);
        User user=new User("Existing","existing@example.com","hash","USER",false,"SUSPENDED");
        when(repository.findByEmail("existing@example.com")).thenReturn(Optional.of(user));
        var initializer=new DevAdminInitializer(repository,encoder);
        ReflectionTestUtils.setField(initializer,"devAdminEnabled",true);
        ReflectionTestUtils.setField(initializer,"adminPassword","explicit-test-password");
        ReflectionTestUtils.setField(initializer,"adminEmail","existing@example.com");
        initializer.run();assertEquals("USER",user.getRole());assertEquals("SUSPENDED",user.getAccountStatus());
        assertFalse(user.isEmailVerified());verify(repository,never()).save(any());verifyNoInteractions(encoder);
    }
    @Test void bootstrapRequiresAnExplicitStrongPassword() {
        var repository=mock(UserRepository.class);
        var initializer=new DevAdminInitializer(repository,mock(PasswordEncoder.class));
        ReflectionTestUtils.setField(initializer,"devAdminEnabled",true);
        ReflectionTestUtils.setField(initializer,"adminPassword","");
        assertThrows(IllegalArgumentException.class,()->initializer.run());verifyNoInteractions(repository);
    }
}
