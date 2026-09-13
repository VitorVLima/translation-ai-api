package com.example.com.englishai.backend.infrastructure.metrics;

import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Operational measurements only: closed labels, monotonic time, no request or exception data. */
public final class AiMetrics {
    private static final Logger LOG = LoggerFactory.getLogger(AiMetrics.class);
    private AiMetrics() {}

    public enum Operation { STT, TTS, LLM_COMPLETE, LLM_FIRST_CHUNK, LLM_STREAM_TOTAL, CHAT_FIRST_TOKEN, CHAT_TOTAL }
    public enum Provider { WHISPER, PIPER, OLLAMA, GEMINI, UNKNOWN }
    public enum Status { SUCCESS, ERROR, TIMEOUT }

    public static Provider provider(String configured) {
        if (configured == null) return Provider.UNKNOWN;
        return switch (configured.trim().toLowerCase(Locale.ROOT)) {
            case "whisper" -> Provider.WHISPER;
            case "piper" -> Provider.PIPER;
            case "ollama" -> Provider.OLLAMA;
            case "gemini" -> Provider.GEMINI;
            default -> Provider.UNKNOWN;
        };
    }

    public static Sample start(Operation operation, Provider provider) {
        return new Sample(operation, provider);
    }

    public static <T> T measure(Operation operation, Provider provider, Supplier<T> call) {
        try (var sample = start(operation, provider)) {
            T result = call.get();
            sample.success();
            return result;
        }
    }

    public static final class Sample implements AutoCloseable {
        private final long started = System.nanoTime();
        private final Operation operation;
        private final Provider provider;
        private final AtomicBoolean first = new AtomicBoolean();
        private final AtomicBoolean finished = new AtomicBoolean();
        private volatile Status status = Status.ERROR;

        private Sample(Operation operation, Provider provider) {
            this.operation = operation;
            this.provider = provider;
        }

        public void first(Operation firstOperation) {
            if (!finished.get() && first.compareAndSet(false, true)) log(firstOperation, Status.SUCCESS);
        }

        public void success() { status = Status.SUCCESS; }

        public void finish(Status finalStatus) {
            if (finished.compareAndSet(false, true)) log(operation, finalStatus);
        }

        private void log(Operation measuredOperation, Status measuredStatus) {
            long durationMs = Math.max(0, (System.nanoTime() - started) / 1_000_000);
            LOG.info("AI_METRIC operation={} provider={} duration_ms={} status={}",
                    measuredOperation.name().toLowerCase(Locale.ROOT),
                    provider.name().toLowerCase(Locale.ROOT), durationMs,
                    measuredStatus.name().toLowerCase(Locale.ROOT));
        }

        @Override public void close() { finish(status); }
    }
}
