package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import com.example.com.englishai.backend.application.ports.RefreshTokenTransaction;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.function.Function;

@Component
public class RefreshTokenTransactionAdapter implements RefreshTokenTransaction {

    private final RefreshTokenRepository refreshTokenRepository;

    public RefreshTokenTransactionAdapter(RefreshTokenRepository refreshTokenRepository) {
        this.refreshTokenRepository = refreshTokenRepository;
    }

    @Override
    @Transactional
    public <T> T execute(Function<RefreshTokenRepository, T> operation) {
        return Objects.requireNonNull(operation, "Transaction operation is required")
                .apply(refreshTokenRepository);
    }
}
