package com.example.com.englishai.backend.integration.authentication;

import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenFamilyJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class RefreshTokenFamilyLockIntegrationTest {

    @Autowired
    private RefreshTokenFamilyJpaRepository familyRepository;

    @Autowired
    private UserJpaRepository userRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    private UUID userId;

    @AfterEach
    void cleanup() {
        if (userId != null) {
            inTransaction(status -> {
                userRepository.deleteById(userId);
                return null;
            });
        }
    }

    @Test
    void shouldBlockSecondTransactionForSameFamilyUntilFirstCommits() throws Exception {
        UserEntity user = saveUser();
        UUID familyId = saveFamily(user.getId());
        CountDownLatch firstHasLock = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<?> first = executor.submit(() -> inTransaction(status -> {
                familyRepository.findByIdForUpdate(familyId).orElseThrow();
                firstHasLock.countDown();
                await(releaseFirst);
                return null;
            }));
            assertThat(firstHasLock.await(5, TimeUnit.SECONDS)).isTrue();

            Future<?> second = executor.submit(() -> inTransaction(status -> {
                secondStarted.countDown();
                familyRepository.findByIdForUpdate(familyId).orElseThrow();
                return null;
            }));
            assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(second.isDone()).isFalse();

            releaseFirst.countDown();
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void shouldNotBlockDifferentFamilies() throws Exception {
        UserEntity user = saveUser();
        UUID firstFamilyId = saveFamily(user.getId());
        UUID secondFamilyId = saveFamily(user.getId());
        CountDownLatch firstHasLock = new CountDownLatch(1);
        CountDownLatch secondAcquired = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            Future<?> first = executor.submit(() -> inTransaction(status -> {
                familyRepository.findByIdForUpdate(firstFamilyId).orElseThrow();
                firstHasLock.countDown();
                await(releaseFirst);
                return null;
            }));
            assertThat(firstHasLock.await(5, TimeUnit.SECONDS)).isTrue();

            Future<?> second = executor.submit(() -> inTransaction(status -> {
                familyRepository.findByIdForUpdate(secondFamilyId).orElseThrow();
                secondAcquired.countDown();
                return null;
            }));
            assertThat(secondAcquired.await(2, TimeUnit.SECONDS)).isTrue();

            releaseFirst.countDown();
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        } finally {
            releaseFirst.countDown();
            executor.shutdownNow();
        }
    }

    private UserEntity saveUser() {
        return inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            String unique = UUID.randomUUID().toString();
            UserEntity user = userRepository.save(new UserEntity(
                    UUID.randomUUID(), "family-lock-" + unique + "@test.com", "family-lock-" + unique,
                    "hash", now, now
            ));
            userId = user.getId();
            return user;
        });
    }

    private UUID saveFamily(UUID ownerId) {
        return inTransaction(status -> {
            OffsetDateTime now = OffsetDateTime.now();
            UUID familyId = UUID.randomUUID();
            familyRepository.save(new RefreshTokenFamilyEntity(
                    familyId, ownerId, now, now.plusDays(30), null
            ));
            return familyId;
        });
    }

    private <T> T inTransaction(
            java.util.function.Function<org.springframework.transaction.TransactionStatus, T> operation
    ) {
        return new TransactionTemplate(transactionManager).execute(operation::apply);
    }

    private void await(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
