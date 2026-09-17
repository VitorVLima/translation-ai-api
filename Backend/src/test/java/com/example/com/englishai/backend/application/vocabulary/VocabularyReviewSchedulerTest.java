package com.example.com.englishai.backend.application.vocabulary;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class VocabularyReviewSchedulerTest {
    private final VocabularyReviewScheduler scheduler = new VocabularyReviewScheduler(
            Clock.fixed(Instant.parse("2026-09-16T12:00:00Z"), ZoneOffset.UTC));

    @Test
    void successfulEvidenceAdvancesThroughTheDeterministicIntervals() {
        var first = scheduler.record(VocabularyService.ProgressStatus.NEW, 0, true);
        var second = scheduler.record(first.status(), first.stage(), true);
        var third = scheduler.record(second.status(), second.stage(), true);
        var fourth = scheduler.record(third.status(), third.stage(), true);
        var fifth = scheduler.record(fourth.status(), fourth.stage(), true);

        assertThat(first.status()).isEqualTo(VocabularyService.ProgressStatus.LEARNING);
        assertThat(first.stage()).isEqualTo(1);
        assertThat(first.nextReviewAt()).isEqualTo(Instant.parse("2026-09-17T12:00:00Z").atOffset(ZoneOffset.UTC));
        assertThat(second.status()).isEqualTo(VocabularyService.ProgressStatus.REVIEWING);
        assertThat(second.stage()).isEqualTo(2);
        assertThat(second.nextReviewAt()).isEqualTo(Instant.parse("2026-09-19T12:00:00Z").atOffset(ZoneOffset.UTC));
        assertThat(third.nextReviewAt()).isEqualTo(Instant.parse("2026-09-23T12:00:00Z").atOffset(ZoneOffset.UTC));
        assertThat(fourth.nextReviewAt()).isEqualTo(Instant.parse("2026-09-30T12:00:00Z").atOffset(ZoneOffset.UTC));
        assertThat(fifth.status()).isEqualTo(VocabularyService.ProgressStatus.MASTERED);
        assertThat(fifth.stage()).isEqualTo(5);
        assertThat(fifth.nextReviewAt()).isEqualTo(Instant.parse("2026-10-16T12:00:00Z").atOffset(ZoneOffset.UTC));
    }

    @Test
    void incorrectEvidenceBringsTheStageCloserWithoutErasingHistory() {
        var learningError = scheduler.record(VocabularyService.ProgressStatus.LEARNING, 1, false);
        var reviewingError = scheduler.record(VocabularyService.ProgressStatus.REVIEWING, 3, false);
        var masteredError = scheduler.record(VocabularyService.ProgressStatus.MASTERED, 5, false);

        assertThat(learningError.status()).isEqualTo(VocabularyService.ProgressStatus.LEARNING);
        assertThat(learningError.stage()).isEqualTo(1);
        assertThat(reviewingError.status()).isEqualTo(VocabularyService.ProgressStatus.REVIEWING);
        assertThat(reviewingError.stage()).isEqualTo(2);
        assertThat(masteredError.status()).isEqualTo(VocabularyService.ProgressStatus.REVIEWING);
        assertThat(masteredError.stage()).isEqualTo(4);
        assertThat(masteredError.nextReviewAt()).isEqualTo(Instant.parse("2026-09-30T12:00:00Z").atOffset(ZoneOffset.UTC));
    }
}
