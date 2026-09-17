package com.example.com.englishai.backend.application.vocabulary;

import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponse;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserVocabularyWordEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyItemEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.VocabularyLessonEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserVocabularyWordJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyItemJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyLessonJpaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class VocabularyReviewCompositionTest {
    private final LlmProvider provider = mock(LlmProvider.class);
    private final UserProfileJpaRepository profiles = mock(UserProfileJpaRepository.class);
    private final VocabularyLessonJpaRepository lessons = mock(VocabularyLessonJpaRepository.class);
    private final UserVocabularyWordJpaRepository words = mock(UserVocabularyWordJpaRepository.class);
    private final VocabularyItemJpaRepository items = mock(VocabularyItemJpaRepository.class);
    private final UserJpaRepository users = mock(UserJpaRepository.class);
    private final UUID user = UUID.randomUUID();
    private final VocabularyReviewScheduler scheduler = new VocabularyReviewScheduler(
            Clock.fixed(Instant.parse("2026-09-16T12:00:00Z"), ZoneOffset.UTC));
    private final Map<String, UserVocabularyWordEntity> progress = new HashMap<>();
    private VocabularyService service;

    @BeforeEach
    void setup() {
        service = new VocabularyService(provider, profiles, lessons, words, items, users, scheduler);
        when(users.findByIdForUpdate(user)).thenReturn(Optional.of(mock(UserEntity.class)));
        when(lessons.findByUserIdAndLessonDate(any(), any())).thenReturn(Optional.empty());
        when(lessons.findRecentWords(any(), any(Pageable.class))).thenReturn(List.of());
        when(lessons.saveAndFlush(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(words.findExistingNormalizedWords(any(), anyCollection())).thenReturn(List.of());
        doAnswer(invocation -> {
            UUID id = invocation.getArgument(0);
            UUID owner = invocation.getArgument(1);
            String word = invocation.getArgument(2);
            String normalized = invocation.getArgument(3);
            OffsetDateTime now = invocation.getArgument(4);
            progress.putIfAbsent(owner + ":" + normalized,
                    new UserVocabularyWordEntity(id, owner, word, normalized, now));
            return null;
        }).when(words).insertIfAbsent(any(), any(), any(), any(), any());
        when(words.findForUpdateByUserIdAndNormalizedWord(any(), any())).thenAnswer(invocation ->
                Optional.ofNullable(progress.get(invocation.getArgument(0) + ":" + invocation.getArgument(1))));
        when(words.findDueForReview(any(), any(), any(), any(Pageable.class))).thenReturn(List.of());
        when(items.findRecentSourcesByVocabularyWordIds(any(), any(), anyCollection())).thenReturn(List.of());
        when(provider.complete(any())).thenAnswer(invocation -> {
            LlmRequest request = invocation.getArgument(0);
            int count = Integer.parseInt(request.systemPrompt().replaceAll(".*Create exactly (\\d+).*", "$1"));
            return new LlmResponse(generatedWords(count));
        });
    }

    @Test
    void composesTenWordsWithZeroToThreeDueReviewsAndRequestsOnlyTheMissingNewWords() {
        assertComposition(0, 10);
        assertComposition(1, 9);
        assertComposition(2, 8);
        assertComposition(3, 7);
        assertComposition(10, 7);
    }

    @Test
    void usesOnlyTheCurrentCategoryForDueReviews() {
        VocabularyCategory currentCategory = VocabularyCategory.values()[Math.floorMod(
                java.util.Objects.hash(user, scheduler.today()), VocabularyCategory.values().length)];
        var matching = reviewSources(currentCategory, 1);
        when(words.findDueForReview(any(), any(), any(), any(Pageable.class))).thenAnswer(invocation ->
                invocation.getArgument(1).equals(currentCategory)
                        ? matching.stream().map(VocabularyItemEntity::getVocabularyWord).toList() : List.of());
        when(items.findRecentSourcesByVocabularyWordIds(any(), any(), anyCollection())).thenReturn(matching);

        var lesson = service.today(user);

        assertThat(lesson.words()).hasSize(10);
        assertThat(lesson.words()).filteredOn(VocabularyService.Word::review).hasSize(1)
                .allMatch(word -> word.category() == currentCategory);
    }

    @Test
    void retriesOnlyTheMissingWordsWhenProviderCollidesWithKnownProgress() {
        when(words.findExistingNormalizedWords(any(), anyCollection()))
                .thenReturn(List.of("new-1"), List.of());
        doReturn(
                new LlmResponse(generatedWords(10)),
                new LlmResponse("{\"words\":[{\"word\":\"replacement\",\"translation\":\"substituta\",\"example\":\"A replacement example.\",\"exampleTranslation\":\"Um exemplo substituto.\"}]}")
        ).when(provider).complete(any());

        var lesson = service.today(user);

        assertThat(lesson.words()).hasSize(10).extracting(VocabularyService.Word::word)
                .doesNotContain("new-1").doesNotHaveDuplicates();
        verify(provider, times(2)).complete(any());
    }

    @Test
    void stopsAfterBoundedCollisionRetriesBeforePersistingALesson() {
        when(words.findExistingNormalizedWords(any(), anyCollection()))
                .thenAnswer(invocation -> ((java.util.Collection<String>) invocation.getArgument(1)).stream().toList());

        assertThatThrownBy(() -> service.today(user))
                .isInstanceOf(com.example.com.englishai.backend.application.llm.LlmProviderException.class);
        verify(provider, times(3)).complete(any());
        verify(lessons, org.mockito.Mockito.never()).saveAndFlush(any());
    }

    private void assertComposition(int dueCount, int expectedNewCount) {
        var sources = reviewSources(VocabularyCategory.FOOD, dueCount);
        when(words.findDueForReview(any(), any(), any(), any(Pageable.class)))
                .thenReturn(sources.stream().map(VocabularyItemEntity::getVocabularyWord).toList());
        when(items.findRecentSourcesByVocabularyWordIds(any(), any(), anyCollection())).thenReturn(sources);

        var lesson = service.today(user);

        assertThat(lesson.words()).hasSize(10);
        assertThat(lesson.words()).filteredOn(VocabularyService.Word::review).hasSize(Math.min(dueCount, 3));
        assertThat(lesson.words()).filteredOn(word -> !word.review()).hasSize(expectedNewCount);
        assertThat(lesson.words()).extracting(VocabularyService.Word::word).doesNotHaveDuplicates();
    }

    private List<VocabularyItemEntity> reviewSources(VocabularyCategory category, int count) {
        OffsetDateTime now = scheduler.now().minusDays(1);
        var historical = new VocabularyLessonEntity(UUID.randomUUID(), user, LocalDate.of(2026, 9, 1),
                com.example.com.englishai.backend.application.profile.EnglishLevel.B1, category, now);
        var result = new ArrayList<VocabularyItemEntity>();
        for (int index = 1; index <= count; index++) {
            var progress = new UserVocabularyWordEntity(UUID.randomUUID(), user, "review-" + index,
                    "review-" + index, now);
            historical.addItem(new VocabularyItemEntity(UUID.randomUUID(), historical, index, progress.getWord(),
                    "tradução", "Example.", "Exemplo.", category, progress));
            result.add(historical.getItems().getLast());
        }
        return result;
    }

    private String generatedWords(int count) {
        StringBuilder json = new StringBuilder("{\"words\":[");
        for (int index = 1; index <= count; index++) {
            if (index > 1) json.append(',');
            json.append("{\"word\":\"new-").append(index).append("\",\"translation\":\"nova\",")
                    .append("\"example\":\"A new example.\",\"exampleTranslation\":\"Um novo exemplo.\"}");
        }
        return json.append("]}").toString();
    }
}
