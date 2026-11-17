package com.quickkart.support;

import org.springframework.test.context.ContextConfigurationAttributes;
import org.springframework.test.context.ContextCustomizer;
import org.springframework.test.context.ContextCustomizerFactory;
import org.springframework.core.env.MapPropertySource;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public class IsolatedDatabaseContextCustomizerFactory implements ContextCustomizerFactory {
    // No external URL override: PostgreSQL mode creates and owns a new disposable container.
    private static class Postgres {
        static final org.testcontainers.containers.PostgreSQLContainer<?> DB = start();
        static org.testcontainers.containers.PostgreSQLContainer<?> start() {
            var db = new org.testcontainers.containers.PostgreSQLContainer<>("postgres:15-alpine")
                .withDatabaseName("quickkart_test_" + UUID.randomUUID().toString().replace("-", ""))
                .withUsername("test").withPassword(UUID.randomUUID().toString())
                .withTmpFs(Map.of("/var/lib/postgresql/data", "rw"));
            db.start();
            // Ryuk cleans up after JVM exit; stopping here would race Spring datasource shutdown.
            return db;
        }
    }
    @Override
    public ContextCustomizer createContextCustomizer(Class<?> testClass, List<ContextConfigurationAttributes> attributes) {
        return (context, merged) -> {
            boolean postgres = Boolean.getBoolean("quickkart.test.postgres");
            String url = postgres ? Postgres.DB.getJdbcUrl() : "jdbc:h2:mem:quickkart_test_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";
            // Tests that start an embedded broker keep its address and their listeners.
            boolean embeddedKafka = org.springframework.core.annotation.AnnotatedElementUtils.hasAnnotation(
                    testClass, org.springframework.kafka.test.context.EmbeddedKafka.class);
            java.util.Map<String, Object> isolated = new java.util.HashMap<>(Map.ofEntries(
                Map.entry("spring.datasource.url", url),
                Map.entry("spring.datasource.hikari.jdbc-url", url),
                Map.entry("spring.datasource.driver-class-name", postgres ? "org.postgresql.Driver" : "org.h2.Driver"),
                Map.entry("spring.datasource.username", postgres ? Postgres.DB.getUsername() : "sa"), Map.entry("spring.datasource.password", postgres ? Postgres.DB.getPassword() : ""),
                Map.entry("spring.jpa.hibernate.ddl-auto", postgres ? "create" : "create-drop"),
                Map.entry("spring.jpa.database-platform", postgres ? "org.hibernate.dialect.PostgreSQLDialect" : "org.hibernate.dialect.H2Dialect"),
                Map.entry("app.dev-admin.enabled", "false"),
                Map.entry("app.dev-tools.enabled", "false"), Map.entry("app.kafka.embedded.enabled", "false"),
                Map.entry("spring.kafka.listener.auto-startup", "false"), Map.entry("spring.kafka.admin.auto-create", "false"),
                Map.entry("spring.data.redis.host", "127.0.0.1"), Map.entry("spring.data.redis.port", "1"),
                Map.entry("spring.kafka.bootstrap-servers", "127.0.0.1:1"),
                Map.entry("management.health.redis.enabled", "false"), Map.entry("spring.jpa.open-in-view", "false"),
                Map.entry("spring.cache.type", "simple"), Map.entry("spring.profiles.active", "test"),
                Map.entry("jwt.secret", "dGVzdC1vbmx5LWtleS0zMi1ieXRlcy1taW5pbXVtLTEyMzQ1Njc4OTA="),
                Map.entry("otp.secret", "b3RwLXRlc3Qtb25seS1zZXBhcmF0ZS1rZXktMzItYnl0ZXMtMTIzNA=="),
                Map.entry("app.mail.from", "test@example.invalid"), Map.entry("spring.mail.host", "localhost")
        ));
            if (embeddedKafka) {
                isolated.remove("spring.kafka.bootstrap-servers");
                isolated.remove("spring.kafka.listener.auto-startup");
                isolated.remove("spring.kafka.admin.auto-create");
            }
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("isolated-test-database", isolated));
            context.addBeanFactoryPostProcessor(factory -> {
                if (!factory.containsSingleton("smtpEmailService")) factory.registerSingleton("smtpEmailService",
                    org.mockito.Mockito.mock(com.quickkart.service.EmailService.class));
                if (!embeddedKafka && !factory.containsSingleton("orderEventProducer")) factory.registerSingleton("orderEventProducer",
                    org.mockito.Mockito.mock(com.quickkart.producer.OrderEventProducer.class));
                if (!context.getEnvironment().getRequiredProperty("spring.datasource.url").equals(url) ||
                    !context.getEnvironment().getRequiredProperty("spring.datasource.hikari.jdbc-url").equals(url))
                    throw new IllegalStateException("Tests may only use their generated disposable database");
            });
        };
    }
}
