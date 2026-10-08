package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.infrastructure.security.AiWorkloadLimiter.Operation;
import jakarta.servlet.FilterChain;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.assertj.core.api.Assertions.*;

class AiWorkloadLimiterTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    private AiWorkloadLimiter limiter(int minute, int llm, int stt) {
        return new AiWorkloadLimiter(new LocalBucketRateLimitService(100, Duration.ofHours(2)),
                30, minute, 12, 120, 2, llm, stt, 2, 2);
    }

    @Test void limitsOneOperationWithoutSharingItsQuotaWithAnotherUserOrOperation() {
        var limit = limiter(1, 8, 2);
        var a = UUID.randomUUID(); var b = UUID.randomUUID();
        try (var ignored = limit.admit(a, Operation.CHAT, false)) {
            assertThatThrownBy(() -> limit.admit(a, Operation.CHAT, false))
                    .isInstanceOf(RateLimitExceededException.class);
            try (var other = limit.admit(a, Operation.TRANSLATION, false);
                 var secondUser = limit.admit(b, Operation.CHAT, false)) {
                assertThat(limit.active(Operation.CHAT)).isEqualTo(2);
            }
        }
        assertThatThrownBy(() -> limit.admit(a, Operation.CHAT, false))
                .isInstanceOf(RateLimitExceededException.class)
                .satisfies(error -> assertThat(((RateLimitExceededException) error).getRetryAfter()).isPositive());
        assertThat(limit.active(Operation.CHAT)).isZero();
    }

    @Test void concurrentAudioIsBoundedAndOneAccountCannotOccupyAllSlots() throws Exception {
        var limit = limiter(6, 8, 2);
        var a = UUID.randomUUID(); var b = UUID.randomUUID(); var c = UUID.randomUUID();
        var entered = new CountDownLatch(2); var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { try (var ignored = limit.admit(a, Operation.STT, false)) {
                entered.countDown(); release.await(5, TimeUnit.SECONDS); return true;
            }});
            var second = pool.submit(() -> { try (var ignored = limit.admit(b, Operation.STT, false)) {
                entered.countDown(); release.await(5, TimeUnit.SECONDS); return true;
            }});
            assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> limit.admit(a, Operation.STT, false)).isInstanceOf(RateLimitExceededException.class);
            assertThatThrownBy(() -> limit.admit(c, Operation.STT, false)).isInstanceOf(RateLimitExceededException.class);
            release.countDown(); assertThat(first.get()).isTrue(); assertThat(second.get()).isTrue();
        }
        try (var recovered = limit.admit(c, Operation.STT, false)) { assertThat(limit.active(Operation.STT)).isEqualTo(1); }
    }

    @Test void ttsHasIndependentCapacityAndReleasesItAfterCompletion() {
        var limit = limiter(6, 8, 1);
        var a = UUID.randomUUID(); var b = UUID.randomUUID(); var c = UUID.randomUUID();
        try (var first = limit.admit(a, Operation.TTS, false);
             var second = limit.admit(b, Operation.TTS, false);
             var stt = limit.admit(c, Operation.STT, false)) {
            assertThat(limit.active(Operation.TTS)).isEqualTo(2);
            assertThat(limit.active(Operation.STT)).isEqualTo(1);
            assertThatThrownBy(() -> limit.admit(c, Operation.TTS, false))
                    .isInstanceOf(RateLimitExceededException.class);
        }
        try (var recovered = limit.admit(c, Operation.TTS, false)) {
            assertThat(limit.active(Operation.TTS)).isEqualTo(1);
        }
    }

    @Test void filterReturns429AndRetryAfterForAuthenticatedExpensiveRequest() throws Exception {
        var filter = new AiWorkloadFilter(limiter(1, 8, 2));
        var user = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, List.of()));
        FilterChain chain = (request, response) -> {};
        var first = new MockHttpServletRequest("POST", "/api/v1/translate");
        filter.doFilter(first, new MockHttpServletResponse(), chain);
        var second = new MockHttpServletRequest("POST", "/api/v1/translate");
        var response = new MockHttpServletResponse();
        filter.doFilter(second, response, chain);
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(Long.parseLong(response.getHeader("Retry-After"))).isPositive();
        assertThat(response.getContentAsString()).contains("Too many requests");
        assertThat(AiWorkloadFilter.operation("GET", "/api/v1/progress")).isNull();
        assertThat(AiWorkloadFilter.operation("POST", "/api/v1/correct/explain")).isEqualTo(Operation.TRANSLATION);
    }

    @Test void asyncStreamReleasesAdmissionWhenClientCompletes() throws Exception {
        var limit = limiter(6, 8, 2);
        var filter = new AiWorkloadFilter(limit);
        var user = UUID.randomUUID();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null, List.of()));
        var request = new MockHttpServletRequest("POST", "/api/v1/chat/stream");
        request.setAsyncSupported(true);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> req.startAsync());
        assertThat(limit.activeStreams()).isEqualTo(1);
        request.getAsyncContext().complete();
        assertThat(limit.activeStreams()).isZero();
        try (var accepted = limit.admit(user, Operation.SSE, true)) {
            assertThat(limit.activeStreams()).isEqualTo(1);
        }
    }
}
