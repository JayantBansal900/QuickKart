package com.quickkart.repository;

import com.quickkart.entity.EmailVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

    Optional<EmailVerification> findTopByEmailAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(String email, String purpose);

    java.util.List<EmailVerification> findAllByEmailAndVerifiedFalse(String email);

    java.util.List<EmailVerification> findAllByEmailAndPurposeAndVerifiedFalse(String email, String purpose);

    void deleteByEmail(String email);
}
