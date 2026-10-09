package com.example.com.englishai.backend.presentation.rest.reading;

import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.reading.*;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Duration;
import java.util.*;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ReadingController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class ReadingControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ReadingService service;
    @MockitoBean AuthenticationTokenValidator tokens;
    @BeforeEach void auth() { when(tokens.validateAndGetUserId("test")).thenReturn(UUID.randomUUID()); }

    @Test void requiresAuthenticationForBothEndpoints() throws Exception {
        for (String path : List.of("generate", "hint", "questions")) mvc.perform(post("/api/v1/reading/" + path)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void returnsReadingAndHintsWithoutInternalFields() throws Exception {
        UUID userId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        when(service.generateForUser(userId, ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL))
                .thenReturn(new ReadingService.Reading(UUID.randomUUID(), "A Village Visit", "We visited a village.", ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL));
        mvc.perform(post("/api/v1/reading/generate").header("Authorization", "Bearer test").contentType("application/json")
                .content("{\"difficulty\":\"INTERMEDIATE\",\"topic\":\"TRAVEL\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.title").value("A Village Visit"))
                .andExpect(jsonPath("$.text").value("We visited a village.")).andExpect(jsonPath("$.difficulty").value("INTERMEDIATE"));
        when(service.hint("We visited a village.", ConversationDifficulty.INTERMEDIATE)).thenReturn(new ReadingService.Hints(List.of()));
        mvc.perform(post("/api/v1/reading/hint").header("Authorization", "Bearer test").contentType("application/json")
                .content("{\"text\":\"We visited a village.\",\"difficulty\":\"INTERMEDIATE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
    }
    @Test void activityHintsUseAuthenticatedOwnerAndReturnPersistedItems() throws Exception {
        UUID userId = UUID.randomUUID(), activityId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        when(service.hintsForActivity(userId, activityId)).thenReturn(new ReadingService.Hints(List.of(
                new ReadingService.HintItem("along the way", "Durante o caminho.", ReadingService.HintType.EXPRESSION))));
        mvc.perform(get("/api/v1/reading/" + activityId + "/hints").header("Authorization", "Bearer test"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.items[0].expression").value("along the way"));
        verify(service).hintsForActivity(userId, activityId);
    }
    @Test void rejectsSecondInProgressReadingWithConflict() throws Exception {
        UUID userId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        when(service.generateForUser(userId, ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL))
                .thenThrow(new ReadingActivityInProgressException());

        mvc.perform(post("/api/v1/reading/generate").header("Authorization", "Bearer test").contentType("application/json")
                        .content("{\"difficulty\":\"INTERMEDIATE\",\"topic\":\"TRAVEL\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("You already have a reading activity in progress. Continue it before starting another."));
    }

    @Test void returnsQuestions() throws Exception {
        when(service.questions("We visited a village.", ConversationDifficulty.INTERMEDIATE))
                .thenReturn(new ReadingService.Questions(List.of(
                        new ReadingService.Question(1, ReadingService.QuestionType.MAIN_IDEA, "What happened?", List.of("A", "B", "C", "D"), 0, "O texto informa isso."),
                        new ReadingService.Question(2, ReadingService.QuestionType.DETAIL, "Where?", List.of("A", "B", "C", "D"), 1, "Detalhe."),
                        new ReadingService.Question(3, ReadingService.QuestionType.VOCABULARY, "Meaning?", List.of("A", "B", "C", "D"), 2, "Vocabulário."))));
        mvc.perform(post("/api/v1/reading/questions").header("Authorization", "Bearer test").contentType("application/json")
                        .content("{\"text\":\"We visited a village.\",\"difficulty\":\"INTERMEDIATE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.questions").isArray()).andExpect(jsonPath("$.questions.length()").value(3));
    }

    @Test void listsOnlyTheAuthenticatedUsersActivitiesThroughTheServiceContract() throws Exception {
        UUID userId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        when(service.listForUser(userId)).thenReturn(List.of(
                new ReadingService.ActivitySummary(UUID.randomUUID(), "A Day at Work", ConversationDifficulty.ADVANCED, ReadingTopic.WORK,
                        com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.IN_PROGRESS,
                        3, null, null, java.time.OffsetDateTime.parse("2026-09-20T12:00:00Z"), null),
                new ReadingService.ActivitySummary(UUID.randomUUID(), "A Short Trip", ConversationDifficulty.BEGINNER, ReadingTopic.TRAVEL,
                        com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.SUCCESS,
                        3, 3, 100, java.time.OffsetDateTime.parse("2026-09-19T12:00:00Z"), java.time.OffsetDateTime.parse("2026-09-19T12:10:00Z"))));

        mvc.perform(get("/api/v1/reading").header("Authorization", "Bearer test"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$[0].status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$[0].title").value("A Day at Work"))
                .andExpect(jsonPath("$[1].status").value("SUCCESS"))
                .andExpect(jsonPath("$[0].text").doesNotExist());
        verify(service).listForUser(userId);
    }

    @Test void optionalReadingPageRetainsArrayResponseAndValidatesBounds() throws Exception {
        UUID userId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        when(service.listForUser(eq(userId), any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(List.of(new ReadingService.ActivitySummary(UUID.randomUUID(), "Paged", ConversationDifficulty.BEGINNER,
                        ReadingTopic.TRAVEL, com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.SUCCESS,
                        3, 2, 67, java.time.OffsetDateTime.now(), java.time.OffsetDateTime.now())));
        mvc.perform(get("/api/v1/reading?page=0&size=25").header("Authorization", "Bearer test"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].title").value("Paged"));
        mvc.perform(get("/api/v1/reading?page=0&size=101").header("Authorization", "Bearer test"))
                .andExpect(status().isBadRequest());
    }

    @Test void detailDoesNotExposeAnswersWhileActivityIsInProgress() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        when(service.detailForUser(userId, activityId)).thenReturn(new ReadingService.ActivityDetail(activityId,
                "A Cultural Visit", "A persisted passage.", ConversationDifficulty.INTERMEDIATE, ReadingTopic.CULTURE,
                com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.IN_PROGRESS,
                3, null, null, java.time.OffsetDateTime.parse("2026-09-20T12:00:00Z"), null,
                List.of(new ReadingService.ActivityQuestion(UUID.randomUUID(), ReadingService.QuestionType.DETAIL,
                        "Where?", List.of("A", "B", "C", "D"), null, null))));

        mvc.perform(get("/api/v1/reading/" + activityId).header("Authorization", "Bearer test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activityId").value(activityId.toString()))
                .andExpect(jsonPath("$.title").value("A Cultural Visit"))
                .andExpect(jsonPath("$.questions[0].correctOption").doesNotExist())
                .andExpect(jsonPath("$.questions[0].explanation").doesNotExist());
        verify(service).detailForUser(userId, activityId);
    }

    @Test void detailReturnsPersistedResultAfterCompletion() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        when(service.detailForUser(userId, activityId)).thenReturn(new ReadingService.ActivityDetail(activityId,
                "A Completed Visit", "A completed passage.", ConversationDifficulty.INTERMEDIATE, ReadingTopic.CULTURE,
                com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.SUCCESS,
                3, 2, 67, java.time.OffsetDateTime.parse("2026-09-20T12:00:00Z"), java.time.OffsetDateTime.parse("2026-09-20T12:10:00Z"),
                List.of(new ReadingService.ActivityQuestion(UUID.randomUUID(), ReadingService.QuestionType.DETAIL,
                        "Where?", List.of("A", "B", "C", "D"), 1, "O detalhe aparece no texto."))));

        mvc.perform(get("/api/v1/reading/" + activityId).header("Authorization", "Bearer test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.correctAnswers").value(2))
                .andExpect(jsonPath("$.questions[0].correctOption").value(1))
                .andExpect(jsonPath("$.questions[0].explanation").value("O detalhe aparece no texto."));
    }

    @Test void detailRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/reading/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void deletesAnInProgressActivityForTheAuthenticatedUser() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);

        mvc.perform(delete("/api/v1/reading/" + activityId).header("Authorization", "Bearer test"))
                .andExpect(status().isNoContent());
        verify(service).deleteInProgressForUser(userId, activityId);
    }
    @Test void completedActivityDeletionUsesTheBusinessErrorResponse() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);
        doThrow(new IllegalStateException("Completed reading activities cannot be deleted"))
                .when(service).deleteInProgressForUser(userId, activityId);

        mvc.perform(delete("/api/v1/reading/" + activityId).header("Authorization", "Bearer test"))
                .andExpect(status().isBadRequest());
    }
    @Test void deletionRequiresAuthentication() throws Exception {
        mvc.perform(delete("/api/v1/reading/" + UUID.randomUUID())).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @ParameterizedTest @ValueSource(strings = {"{\"difficulty\":\"EXPERT\",\"topic\":\"TRAVEL\"}",
            "{\"difficulty\":\"BEGINNER\",\"topic\":\"arbitrary prompt\"}", "{}"})
    void rejectsInvalidChoicesBeforeGeneration(String body) throws Exception {
        mvc.perform(post("/api/v1/reading/generate").header("Authorization", "Bearer test").contentType("application/json").content(body))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void rejectsOversizedHintInput() throws Exception {
        mvc.perform(post("/api/v1/reading/hint").header("Authorization", "Bearer test").contentType("application/json")
                .content("{\"text\":\"" + "x".repeat(5001) + "\",\"difficulty\":\"BEGINNER\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void rejectsLongNumericLookingSelectedOptionWithoutStallingAndRemainsUsable() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        UUID questionId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test")).thenReturn(userId);

        String malformedNumber = "1".repeat(20_000) + "x";
        String maliciousBody = "{\"answers\":[{\"questionId\":\"" + questionId
                + "\",\"selectedOption\":\"" + malformedNumber + "\"}]}";

        assertTimeout(Duration.ofSeconds(1), () -> mvc.perform(post("/api/v1/reading/" + activityId + "/submit")
                        .header("Authorization", "Bearer test").contentType("application/json").content(maliciousBody))
                .andExpect(status().isBadRequest()));
        verifyNoInteractions(service);

        when(service.submit(eq(userId), eq(activityId), anyList())).thenReturn(new ReadingService.Submission(
                activityId, 3, 3, 100,
                com.example.com.englishai.backend.infrastructure.persistence.entity.ReadingActivityEntity.ReadingActivityStatus.SUCCESS,
                ConversationDifficulty.INTERMEDIATE));
        String validBody = "{\"answers\":[{\"questionId\":\"" + questionId + "\",\"selectedOption\":0}]}";
        mvc.perform(post("/api/v1/reading/" + activityId + "/submit").header("Authorization", "Bearer test")
                        .contentType("application/json").content(validBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.percentage").value(100));
    }
}
