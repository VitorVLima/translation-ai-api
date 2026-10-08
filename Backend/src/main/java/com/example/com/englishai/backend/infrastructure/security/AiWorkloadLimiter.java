package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.application.ports.RateLimitService;
import java.time.Duration;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** Per-instance admission control. No user content or token is retained. */
public final class AiWorkloadLimiter {
    public enum Operation { CHAT, CONVERSATION, READING, TRANSLATION, EVALUATION, VOCABULARY, STT, TTS, SSE }
    private final RateLimitService rates;
    private final int llmPerHour, llmPerMinute, audioPerMinute, audioPerHour;
    private final int userLlm, globalLlm, globalStt, globalTts, globalStreams;
    private final Map<UUID, EnumMap<Operation, Integer>> users = new HashMap<>();
    private final EnumMap<Operation, Integer> active = new EnumMap<>(Operation.class);
    private int llmActive, sttActive, ttsActive, streamActive;

    public AiWorkloadLimiter(RateLimitService rates, int llmPerHour, int llmPerMinute,
            int audioPerMinute, int audioPerHour, int userLlm, int globalLlm,
            int globalStt, int globalTts, int globalStreams) {
        if (llmPerHour < 1 || llmPerMinute < 1 || audioPerMinute < 1 || audioPerHour < 1
                || userLlm < 1 || globalLlm < 1 || globalStt < 1 || globalTts < 1 || globalStreams < 1)
            throw new IllegalArgumentException("AI limits must be positive");
        this.rates = rates; this.llmPerHour = llmPerHour; this.llmPerMinute = llmPerMinute;
        this.audioPerMinute = audioPerMinute; this.audioPerHour = audioPerHour;
        this.userLlm = userLlm; this.globalLlm = globalLlm; this.globalStt = globalStt;
        this.globalTts = globalTts; this.globalStreams = globalStreams;
    }

    public Lease admit(UUID user, Operation operation, boolean stream) {
        if (user == null || operation == null) throw new IllegalArgumentException("Authenticated user and operation required");
        synchronized (this) {
            var slots = users.computeIfAbsent(user, ignored -> new EnumMap<>(Operation.class));
            // Count attempts before checking slots so a saturated account cannot spam free 429s.
            var minute = rates.tryConsume("ai:" + operation + ":" + user,
                    isLlm(operation) ? llmPerMinute : audioPerMinute, Duration.ofMinutes(1));
            if (!minute.allowed()) {
                if (slots.isEmpty()) users.remove(user);
                throw new RateLimitExceededException(minute.retryAfter());
            }
            int userTotal = slots.entrySet().stream().filter(e -> isLlm(e.getKey())).mapToInt(Map.Entry::getValue).sum();
            boolean unavailable = slots.getOrDefault(operation, 0) >= 1
                    || (isLlm(operation) && (userTotal >= userLlm || llmActive >= globalLlm))
                    || (operation == Operation.STT && sttActive >= globalStt)
                    || (operation == Operation.TTS && ttsActive >= globalTts)
                    || (stream && streamActive >= globalStreams);
            if (unavailable) {
                if (slots.isEmpty()) users.remove(user);
                throw new RateLimitExceededException(Duration.ofSeconds(1));
            }
            var hourly = rates.tryConsume((isLlm(operation) ? "ai:llm:" : "ai:audio:") + user,
                    isLlm(operation) ? llmPerHour : audioPerHour, Duration.ofHours(1));
            if (!hourly.allowed()) {
                if (slots.isEmpty()) users.remove(user);
                throw new RateLimitExceededException(hourly.retryAfter());
            }
            slots.put(operation, 1);
            active.merge(operation, 1, Integer::sum);
            if (isLlm(operation)) llmActive++;
            else if (operation == Operation.STT) sttActive++;
            else ttsActive++;
            if (stream) streamActive++;
            return new Lease(user, operation, stream);
        }
    }

    public synchronized int active(Operation operation) { return active.getOrDefault(operation, 0); }
    public synchronized int activeStreams() { return streamActive; }
    private static boolean isLlm(Operation operation) { return operation != Operation.STT && operation != Operation.TTS; }

    public final class Lease implements AutoCloseable {
        private final UUID user;
        private final Operation operation;
        private final boolean stream;
        private final AtomicBoolean closed = new AtomicBoolean();
        private Lease(UUID user, Operation operation, boolean stream) {
            this.user = user; this.operation = operation; this.stream = stream;
        }
        @Override public void close() {
            if (!closed.compareAndSet(false, true)) return;
            synchronized (AiWorkloadLimiter.this) {
                var slots = users.get(user);
                slots.remove(operation);
                if (slots.isEmpty()) users.remove(user);
                active.compute(operation, (ignored, value) -> value == 1 ? null : value - 1);
                if (isLlm(operation)) llmActive--;
                else if (operation == Operation.STT) sttActive--;
                else ttsActive--;
                if (stream) streamActive--;
            }
        }
    }
}
