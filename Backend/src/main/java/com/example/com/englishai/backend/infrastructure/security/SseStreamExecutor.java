package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Bounded worker pool for blocking provider streams; cancellation interrupts HTTP calls. */
public final class SseStreamExecutor {
    private static final System.Logger LOG = System.getLogger(SseStreamExecutor.class.getName());
    private final ThreadPoolExecutor workers;

    public SseStreamExecutor(int threads, int queueSize) {
        if (threads < 1 || queueSize < 1) throw new IllegalArgumentException("SSE capacity must be positive");
        workers = new ThreadPoolExecutor(threads, threads, 0, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(queueSize), runnable -> {
                    var thread = new Thread(runnable, "englishai-sse");
                    thread.setDaemon(false);
                    return thread;
                }, new ThreadPoolExecutor.AbortPolicy());
    }

    public void start(SseEmitter emitter, Runnable work) {
        var future = new AtomicReference<Future<?>>();
        Runnable cancel = () -> { var submitted = future.get(); if (submitted != null) submitted.cancel(true); };
        emitter.onCompletion(cancel);
        emitter.onTimeout(() -> { cancel.run(); emitter.complete(); });
        emitter.onError(ignored -> cancel.run());
        try { future.set(workers.submit(work)); }
        catch (RejectedExecutionException rejected) {
            LOG.log(System.Logger.Level.WARNING, "SSE executor saturated active={0} queued={1}",
                    workers.getActiveCount(), workers.getQueue().size());
            throw new RateLimitExceededException(Duration.ofSeconds(1));
        }
    }

    public int active() { return workers.getActiveCount(); }
    public int queued() { return workers.getQueue().size(); }
    @PreDestroy public void close() { workers.shutdownNow(); }
}
