package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.ports.RefreshTokenRepository;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RefreshTokenTransactionAdapterTest {

    private final RefreshTokenRepository repository = mock(RefreshTokenRepository.class);
    private final RefreshTokenTransactionAdapter adapter = new RefreshTokenTransactionAdapter(repository);

    @Test
    void shouldExecuteOperationAgainstRepository() {
        UUID expected = UUID.randomUUID();

        UUID result = adapter.execute(ignored -> expected);

        assertThat(result).isEqualTo(expected);
    }

    @Test
    void shouldDefineTransactionalBoundary() throws NoSuchMethodException {
        Method method = RefreshTokenTransactionAdapter.class
                .getMethod("execute", java.util.function.Function.class);

        assertThat(method.isAnnotationPresent(org.springframework.transaction.annotation.Transactional.class))
                .isTrue();
    }
}
