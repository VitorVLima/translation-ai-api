package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.ports.EmailVerificationCodeRepository;
import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.infrastructure.persistence.mapper.EmailVerificationCodeMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class EmailVerificationCodeRepositoryAdapter implements EmailVerificationCodeRepository {
    private final EmailVerificationCodeJpaRepository repository;
    private final EmailVerificationCodeMapper mapper;
    public EmailVerificationCodeRepositoryAdapter(EmailVerificationCodeJpaRepository repository, EmailVerificationCodeMapper mapper) {
        this.repository = repository; this.mapper = mapper;
    }
    @Override public EmailVerificationCode save(EmailVerificationCode code) { return mapper.toDomain(repository.save(mapper.toEntity(code))); }
    @Override public Optional<EmailVerificationCode> findById(UUID id) { return repository.findById(id).map(mapper::toDomain); }
    @Override public Optional<EmailVerificationCode> findLatestByUserId(UUID userId) { return repository.findFirstByUserIdOrderByCreatedAtDesc(userId).map(mapper::toDomain); }
    @Override public Optional<EmailVerificationCode> findLatestActiveByUserIdForUpdate(UUID userId, java.time.OffsetDateTime now) {
        return repository.findFirstByUserIdAndUsedAtIsNullAndInvalidatedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(userId, now).map(mapper::toDomain);
    }
    @Override public java.util.List<EmailVerificationCode> findByUserIdForUpdate(UUID userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId).stream().map(mapper::toDomain).toList();
    }
}
