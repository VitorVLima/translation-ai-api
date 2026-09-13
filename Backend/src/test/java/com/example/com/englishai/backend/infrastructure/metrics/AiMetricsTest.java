package com.example.com.englishai.backend.infrastructure.metrics;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import static org.assertj.core.api.Assertions.*;

class AiMetricsTest {
    private Logger logger;
    private ListAppender<ILoggingEvent> appender;
    @BeforeEach void capture() {
        logger = (Logger) LoggerFactory.getLogger(AiMetrics.class);
        appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
    }
    @AfterEach void detach() { logger.detachAppender(appender); appender.stop(); }

    @Test void measuresSuccessWithoutLoggingResult() {
        var result = AiMetrics.measure(AiMetrics.Operation.STT, AiMetrics.Provider.WHISPER, () -> "private transcription");
        assertThat(result).isEqualTo("private transcription");
        assertThat(appender.list).hasSize(1);
        assertThat(appender.list.getFirst().getFormattedMessage())
                .matches("AI_METRIC operation=stt provider=whisper duration_ms=\\d+ status=success");
    }

    @Test void preservesOriginalExceptionAndNeverLogsItsDetails() {
        var failure = new IllegalStateException("private text, token and internal URL");
        assertThatThrownBy(() -> AiMetrics.measure(AiMetrics.Operation.TTS, AiMetrics.Provider.PIPER, () -> { throw failure; }))
                .isSameAs(failure);
        assertThat(appender.list).hasSize(1);
        var event = appender.list.getFirst();
        assertThat(event.getFormattedMessage()).matches("AI_METRIC operation=tts provider=piper duration_ms=\\d+ status=error");
        assertThat(event.getThrowableProxy()).isNull();
    }

    @Test void firstAndTerminalEventsAreEmittedOnceEvenAfterTimeout() {
        try (var sample = AiMetrics.start(AiMetrics.Operation.CHAT_TOTAL, AiMetrics.Provider.OLLAMA)) {
            sample.first(AiMetrics.Operation.CHAT_FIRST_TOKEN);
            sample.first(AiMetrics.Operation.CHAT_FIRST_TOKEN);
            sample.finish(AiMetrics.Status.TIMEOUT);
            sample.success();
            sample.close();
        }
        assertThat(appender.list).hasSize(2);
        assertThat(appender.list.get(0).getFormattedMessage()).contains("operation=chat_first_token");
        assertThat(appender.list.get(1).getFormattedMessage()).contains("operation=chat_total").endsWith("status=timeout");
    }

    @Test void configuredProviderCannotInjectLogContent() {
        assertThat(AiMetrics.provider(" OLLAMA ")).isEqualTo(AiMetrics.Provider.OLLAMA);
        assertThat(AiMetrics.provider("gemini\nsecret")).isEqualTo(AiMetrics.Provider.UNKNOWN);
        assertThat(AiMetrics.provider(null)).isEqualTo(AiMetrics.Provider.UNKNOWN);
    }
}
