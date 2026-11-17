package com.quickkart.service;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.beans.factory.annotation.Value;

@Service("smtpEmailService")
@Profile("!dev | prod")
public class SmtpEmailService implements EmailService {
    private final JavaMailSender sender;
    private final String from;
    public SmtpEmailService(JavaMailSender sender, @Value("${app.mail.from}") String from, org.springframework.core.env.Environment environment) {
        if (from.isBlank() || !from.contains("@")) throw new IllegalStateException("Valid SMTP_FROM is required");
        for (String name : new String[]{"spring.mail.host", "spring.mail.username", "spring.mail.password"})
            if (environment.getProperty(name, "").isBlank()) throw new IllegalStateException("Production SMTP configuration is required");
        this.sender = sender;
        this.from = from;
    }
    @Override
    public void sendVerificationOtp(String email, String name, String otp) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Verify your QuickKart account");
        message.setText("Your verification code is " + otp + ". It expires in five minutes. Do not share it.");
        sender.send(message);
    }
}
