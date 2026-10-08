package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import static org.assertj.core.api.Assertions.*;

class SseStreamExecutorTest {
    private static final class DisconnectableEmitter extends SseEmitter {
        private Runnable completion;
        @Override public void onCompletion(Runnable callback) { completion = callback; }
        void disconnect() { completion.run(); }
    }

    @Test void rejectsSaturationAndInterruptsWorkOnDisconnect() throws Exception {
        var executor = new SseStreamExecutor(1, 1);
        var entered = new CountDownLatch(1);
        var interrupted = new CountDownLatch(1);
        var waiting = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var first = new DisconnectableEmitter();
        try {
            executor.start(first, () -> {
                entered.countDown();
                try { release.await(); } catch (InterruptedException expected) { interrupted.countDown(); Thread.currentThread().interrupt(); }
            });
            assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
            executor.start(new DisconnectableEmitter(), waiting::countDown);
            assertThat(executor.queued()).isEqualTo(1);
            assertThatThrownBy(() -> executor.start(new DisconnectableEmitter(), () -> {}))
                    .isInstanceOf(RateLimitExceededException.class);
            first.disconnect();
            assertThat(interrupted.await(3, TimeUnit.SECONDS)).isTrue();
            assertThat(waiting.await(3, TimeUnit.SECONDS)).isTrue();
        } finally { release.countDown(); executor.close(); }
    }
}
