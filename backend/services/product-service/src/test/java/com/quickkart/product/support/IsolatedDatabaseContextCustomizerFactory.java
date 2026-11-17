package com.quickkart.product.support;

import org.springframework.test.context.ContextConfigurationAttributes;
import org.springframework.test.context.ContextCustomizer;
import org.springframework.test.context.ContextCustomizerFactory;
import org.springframework.core.env.MapPropertySource;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class IsolatedDatabaseContextCustomizerFactory implements ContextCustomizerFactory {
    @Override
    public ContextCustomizer createContextCustomizer(Class<?> testClass, List<ContextConfigurationAttributes> attributes) {
        return (context, merged) -> {
            String url = "jdbc:h2:mem:quickkart_test_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("isolated-test-database", Map.ofEntries(
                Map.entry("spring.datasource.url", url),
                Map.entry("spring.datasource.hikari.jdbc-url", url),
                Map.entry("spring.datasource.driver-class-name", "org.h2.Driver"),
                Map.entry("spring.datasource.username", "sa"), Map.entry("spring.datasource.password", ""),
                Map.entry("spring.jpa.hibernate.ddl-auto", "create-drop"),
                Map.entry("spring.jpa.database-platform", "org.hibernate.dialect.H2Dialect"),
                Map.entry("app.dev-admin.enabled", "false"), Map.entry("app.dev-products.enabled", "false"),
                Map.entry("app.dev-tools.enabled", "false"), Map.entry("app.kafka.embedded.enabled", "false"),
                Map.entry("spring.kafka.listener.auto-startup", "false"), Map.entry("spring.kafka.admin.auto-create", "false"),
                Map.entry("spring.data.redis.host", "127.0.0.1"), Map.entry("spring.data.redis.port", "1"),
                Map.entry("spring.kafka.bootstrap-servers", "127.0.0.1:1"),
                Map.entry("management.health.redis.enabled", "false"), Map.entry("spring.jpa.open-in-view", "false"),
                Map.entry("spring.cache.type", "simple"), Map.entry("spring.profiles.active", "test"),
                Map.entry("jwt.secret", "dGVzdC1vbmx5LWtleS0zMi1ieXRlcy1taW5pbXVtLTEyMzQ1Njc4OTA="),
                Map.entry("otp.secret", "b3RwLXRlc3Qtb25seS1zZXBhcmF0ZS1rZXktMzItYnl0ZXMtMTIzNA=="),
                Map.entry("app.mail.from", "test@example.invalid"), Map.entry("spring.mail.host", "localhost")
        )));
            context.addBeanFactoryPostProcessor(factory -> {
                if (!context.getEnvironment().getRequiredProperty("spring.datasource.url").startsWith("jdbc:h2:mem:quickkart_test_") ||
                    !context.getEnvironment().getRequiredProperty("spring.datasource.hikari.jdbc-url").equals(url))
                    throw new IllegalStateException("Tests may only use the disposable in-memory database");
            });
        };
    }
}
