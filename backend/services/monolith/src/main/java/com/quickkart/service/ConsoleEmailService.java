package com.quickkart.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

/**
 * Development-only "email": prints the OTP to the application log. Never active in prod
 * (profile guard), and switched off in dev when MAIL_TRANSPORT=smtp sends real mail instead.
 */
@org.springframework.context.annotation.Profile("dev & !prod")
@Service
@ConditionalOnProperty(name = "app.mail.transport", havingValue = "console", matchIfMissing = true)
public class ConsoleEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(ConsoleEmailService.class);

    @Override
    public void sendVerificationOtp(String toEmail, String userName, String otp) {
        log.info("""
                ================================================================================
                [QUICKKART NOTIFICATION SERVICE - EMAIL DISPATCH]
                To: {} ({})
                Subject: Verify Your QuickKart Customer Account
                Verification Code: {}
                Validity: 5 Minutes
                Notice: Never disclose this one-time code to anyone. QuickKart staff will never request it.
                ================================================================================
                """, toEmail, userName, otp);
    }

    @Override
    public void sendPasswordResetOtp(String toEmail, String userName, String otp) {
        log.info("""
                ================================================================================
                [QUICKKART NOTIFICATION SERVICE - EMAIL DISPATCH]
                To: {} ({})
                Subject: Reset Your QuickKart Password
                Reset Code: {}
                Validity: 5 Minutes
                ================================================================================
                """, toEmail, userName, otp);
    }
}
