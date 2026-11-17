package com.quickkart.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Service;

@org.springframework.context.annotation.Profile("dev & !prod")
@Service
@ConditionalOnMissingBean(name = "smtpEmailService")
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
}
