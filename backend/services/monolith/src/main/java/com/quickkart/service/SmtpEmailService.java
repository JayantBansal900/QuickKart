package com.quickkart.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

/**
 * Sends real emails over SMTP (e.g. Gmail with an App Password, or any transactional provider).
 *
 * Active when {@code app.mail.transport=smtp}: always in the prod profile, and in development when
 * MAIL_TRANSPORT=smtp is set. Fails fast at startup if the SMTP settings are missing, instead of
 * failing later on a customer's registration.
 */
@Service("smtpEmailService")
@ConditionalOnProperty(name = "app.mail.transport", havingValue = "smtp")
public class SmtpEmailService implements EmailService {

    private final JavaMailSender sender;
    private final String from;

    public SmtpEmailService(JavaMailSender sender, @Value("${app.mail.from}") String from, Environment environment) {
        if (from == null || from.isBlank() || !from.contains("@")) throw new IllegalStateException("Valid SMTP_FROM is required");
        for (String name : new String[]{"spring.mail.host", "spring.mail.username", "spring.mail.password"})
            if (environment.getProperty(name, "").isBlank()) throw new IllegalStateException("SMTP configuration is required: " + name);
        this.sender = sender;
        this.from = from;
    }

    @Override
    public void sendVerificationOtp(String email, String name, String otp) {
        send(email, "Your QuickKart verification code: " + otp,
                plainText(name, otp),
                html(name, otp));
    }

    @Override
    public void sendPasswordResetOtp(String email, String name, String otp) {
        send(email, "Reset your QuickKart password",
                "Hi " + displayName(name) + ",%n%nYour QuickKart password reset code is: %s%n%n".formatted(otp)
                        + "It expires in 5 minutes. If you didn't ask to reset your password, ignore this email - "
                        + "your password stays the same.%n".formatted(),
                layout("Reset your password",
                        "Hi " + HtmlUtils.htmlEscape(displayName(name)) + ", use this code to choose a new password.",
                        otp,
                        "This code expires in <b>5 minutes</b>. If you didn't request a reset, you can ignore this email — your password won't change."));
    }

    private void send(String to, String subject, String text, String html) {
        MimeMessage message = sender.createMimeMessage();
        try {
            // multipart=true: plain-text and HTML alternatives, so every mail client can show it.
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(from, "QuickKart");
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(text, html);
        } catch (MessagingException | java.io.UnsupportedEncodingException ex) {
            throw new MailPreparationException("Could not build email", ex);
        }
        sender.send(message);
    }

    static String plainText(String name, String otp) {
        return "Hi " + displayName(name) + ",\n\n"
                + "Your QuickKart verification code is: " + otp + "\n\n"
                + "It expires in 5 minutes. Never share this code with anyone — QuickKart staff will never ask for it.\n\n"
                + "If you didn't create a QuickKart account, you can ignore this email.\n";
    }

    static String html(String name, String otp) {
        return layout("Verify your email",
                "Hi " + HtmlUtils.htmlEscape(displayName(name)) + ", use this code to finish creating your QuickKart account.",
                otp,
                "This code expires in <b>5 minutes</b>. Never share it with anyone — QuickKart staff will never ask for it. "
                        + "If you didn't create an account, you can ignore this email.");
    }

    /** Shared email layout. {@code intro} and {@code footer} must already be HTML-safe. */
    private static String layout(String title, String intro, String otp, String footer) {
        return """
                <!doctype html>
                <html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#09090b">
                  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
                    <tr><td align="center">
                      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;padding:36px">
                        <tr><td style="font-size:18px;font-weight:700;letter-spacing:-0.3px">quick<span style="color:#4f46e5">kart</span></td></tr>
                        <tr><td style="padding-top:28px;font-size:22px;font-weight:600">%s</td></tr>
                        <tr><td style="padding-top:10px;font-size:15px;line-height:22px;color:#52525b">%s</td></tr>
                        <tr><td style="padding-top:24px">
                          <div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#f4f4f5;border-radius:14px;padding:18px 0">%s</div>
                        </td></tr>
                        <tr><td style="padding-top:20px;font-size:13px;line-height:20px;color:#71717a">%s</td></tr>
                      </table>
                    </td></tr>
                  </table>
                </body></html>
                """.formatted(HtmlUtils.htmlEscape(title), intro, HtmlUtils.htmlEscape(otp), footer);
    }

    private static String displayName(String name) {
        return name == null || name.isBlank() ? "there" : name.trim();
    }
}
