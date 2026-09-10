package com.example.com.englishai.backend.infrastructure.persistence.repository;

import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Lock;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class RefreshTokenFamilyJpaRepositoryTest {

    @Test
    void shouldUsePessimisticWriteForFamilyLookup() throws NoSuchMethodException {
        Method method = RefreshTokenFamilyJpaRepository.class
                .getMethod("findByIdForUpdate", java.util.UUID.class);
        Lock lock = method.getAnnotation(Lock.class);

        assertThat(lock).isNotNull();
        assertThat(lock.value()).isEqualTo(LockModeType.PESSIMISTIC_WRITE);
    }
}
