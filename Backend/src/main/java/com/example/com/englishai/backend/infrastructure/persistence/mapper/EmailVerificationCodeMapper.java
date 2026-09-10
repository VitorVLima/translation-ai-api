package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.authentication.EmailVerificationCode;
import com.example.com.englishai.backend.infrastructure.persistence.entity.EmailVerificationCodeEntity;
import org.springframework.stereotype.Component;

@Component
public class EmailVerificationCodeMapper {
    public EmailVerificationCode toDomain(EmailVerificationCodeEntity entity) {
        return new EmailVerificationCode(entity.getId(), entity.getUserId(), entity.getCodeHash(),
                entity.getCreatedAt(), entity.getExpiresAt(), entity.getUsedAt(), entity.getInvalidatedAt(), entity.getAttempts(), entity.getMaxAttempts());
    }
    public EmailVerificationCodeEntity toEntity(EmailVerificationCode code) {
        return new EmailVerificationCodeEntity(code.getId(), code.getUserId(), code.getCodeHash(),
                code.getCreatedAt(), code.getExpiresAt(), code.getUsedAt(), code.getInvalidatedAt(), code.getAttempts(), code.getMaxAttempts());
    }
}
