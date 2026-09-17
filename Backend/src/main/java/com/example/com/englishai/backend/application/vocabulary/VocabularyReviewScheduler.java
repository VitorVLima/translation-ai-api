package com.example.com.englishai.backend.application.vocabulary;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;

/**
 * Small deterministic review policy. It deliberately does not infer learning from presentation.
 */
public class VocabularyReviewScheduler {
    public static final int MAX_REVIEW_STAGE = 5;
    private static final List<Integer> INTERVAL_DAYS = List.of(1, 3, 7, 14, 30);
    private final Clock clock;

    public VocabularyReviewScheduler(Clock clock) {
        this.clock = Objects.requireNonNull(clock);
    }

    public OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }

    public LocalDate today() {
        return LocalDate.now(clock);
    }

    public ReviewDecision record(VocabularyService.ProgressStatus currentStatus, int currentStage, boolean correct) {
        int stage = Math.max(0, Math.min(MAX_REVIEW_STAGE, currentStage));
        int nextStage = correct ? Math.min(MAX_REVIEW_STAGE, stage + 1) : Math.max(1, stage - 1);
        VocabularyService.ProgressStatus nextStatus = nextStage == MAX_REVIEW_STAGE
                ? VocabularyService.ProgressStatus.MASTERED
                : nextStage == 1
                ? VocabularyService.ProgressStatus.LEARNING
                : VocabularyService.ProgressStatus.REVIEWING;
        OffsetDateTime reviewedAt = now();
        return new ReviewDecision(correct, nextStatus, nextStage,
                reviewedAt.plusDays(INTERVAL_DAYS.get(nextStage - 1)), reviewedAt);
    }

    public record ReviewDecision(boolean correct, VocabularyService.ProgressStatus status, int stage,
                                 OffsetDateTime nextReviewAt, OffsetDateTime reviewedAt) {}
}
