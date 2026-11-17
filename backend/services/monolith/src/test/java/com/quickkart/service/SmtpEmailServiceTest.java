package com.quickkart.service;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimeMultipart;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.mail.MailSenderAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.env.MockEnvironment;

import java.io.ByteArrayOutputStream;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SmtpEmailServiceTest {

    private static MockEnvironment smtpEnv() {
        return new MockEnvironment()
                .withProperty("spring.mail.host", "smtp.example.invalid")
                .withProperty("spring.mail.username", "sender@example.invalid")
                .withProperty("spring.mail.password", "not-a-real-password");
    }

    @Test
    void sendsMultipartEmailWithOtpAndEscapesTheName() throws Exception {
        JavaMailSender sender = mock(JavaMailSender.class);
        when(sender.createMimeMessage()).thenAnswer(i -> new MimeMessage(Session.getInstance(new Properties())));
        var service = new SmtpEmailService(sender, "noreply@example.invalid", smtpEnv());

        service.sendVerificationOtp("asha@mail.quickkart-demo.in", "<b>Asha</b>", "123456");

        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(captor.capture());
        MimeMessage sent = captor.getValue();
        assertEquals("asha@mail.quickkart-demo.in", sent.getAllRecipients()[0].toString());
        assertTrue(sent.getSubject().contains("123456"));
        assertTrue(sent.getContent() instanceof MimeMultipart);

        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        sent.writeTo(raw);
        String body = raw.toString();
        assertTrue(body.contains("123456"), "OTP must be in the body");
        assertTrue(body.contains("text/plain") && body.contains("text/html"), "needs plain-text and HTML parts");
        // Plain text may contain the raw name; the HTML part must not let it become markup.
        String html = SmtpEmailService.html("<b>Asha</b>", "123456");
        assertFalse(html.contains("<b>Asha</b>"), "user-supplied name must be HTML-escaped");
        assertTrue(html.contains("&lt;b&gt;Asha&lt;/b&gt;"));
    }

    @Test
    void neverSendsToReservedTestDomains() {
        JavaMailSender sender = mock(JavaMailSender.class);
        var service = new SmtpEmailService(sender, "noreply@example.invalid", smtpEnv());
        for (String to : new String[]{"a@example.invalid", "b@shop.test", "c@example.com", "d@sub.example.org", "e@localhost"})
            service.sendVerificationOtp(to, "Test", "123456");
        verifyNoInteractions(sender);
        assertFalse(SmtpEmailService.isReservedRecipient("real.person@gmail.com"));
        assertFalse(SmtpEmailService.isReservedRecipient("someone@myexample.com"));
    }

    @Test
    void orderConfirmationListsItemsAndTotal() throws Exception {
        JavaMailSender sender = mock(JavaMailSender.class);
        when(sender.createMimeMessage()).thenAnswer(i -> new MimeMessage(Session.getInstance(new Properties())));
        new SmtpEmailService(sender, "noreply@example.invalid", smtpEnv()).sendOrderConfirmation(
                "asha@mail.quickkart-demo.in", "Asha", 42L, new java.math.BigDecimal("1598.00"),
                java.util.List.of(new com.quickkart.dto.OrderItemSummary(1L, "Ceramic <Mug>", 2, new java.math.BigDecimal("799.00"))));
        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(captor.capture());
        assertEquals("Order #42 confirmed", captor.getValue().getSubject());
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        captor.getValue().writeTo(raw);
        String body = raw.toString(java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(body.contains("1,598"), "total is shown");
        assertTrue(body.contains("Ceramic &lt;Mug&gt;"), "product names are HTML-escaped");
    }

    @Test
    void refusesToStartWithoutCredentials() {
        assertThrows(IllegalStateException.class,
                () -> new SmtpEmailService(mock(JavaMailSender.class), "noreply@example.invalid", new MockEnvironment()));
        assertThrows(IllegalStateException.class,
                () -> new SmtpEmailService(mock(JavaMailSender.class), "", smtpEnv()));
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration.class))
            .withUserConfiguration(SmtpEmailService.class, ConsoleEmailService.class)
            .withPropertyValues("app.mail.from=noreply@example.invalid", "spring.mail.host=smtp.example.invalid",
                    "spring.mail.username=u@example.invalid", "spring.mail.password=p");

    @Test
    void transportPropertySelectsTheImplementation() {
        runner.withPropertyValues("app.mail.transport=smtp", "spring.profiles.active=dev").run(ctx -> {
            assertEquals(1, ctx.getBeansOfType(EmailService.class).size());
            assertTrue(ctx.getBean(EmailService.class) instanceof SmtpEmailService);
        });
        runner.withPropertyValues("app.mail.transport=console", "spring.profiles.active=dev").run(ctx ->
                assertTrue(ctx.getBean(EmailService.class) instanceof ConsoleEmailService));
        // prod never uses the console logger, whatever MAIL_TRANSPORT says
        runner.withPropertyValues("app.mail.transport=console", "spring.profiles.active=prod").run(ctx ->
                assertTrue(ctx.getBeansOfType(EmailService.class).isEmpty()));
    }
}
