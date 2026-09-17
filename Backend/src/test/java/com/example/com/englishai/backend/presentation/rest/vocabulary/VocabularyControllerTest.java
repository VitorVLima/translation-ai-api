package com.example.com.englishai.backend.presentation.rest.vocabulary;

import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.profile.EnglishLevel;
import com.example.com.englishai.backend.application.vocabulary.VocabularyCategory;
import com.example.com.englishai.backend.application.vocabulary.VocabularyService;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(VocabularyController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class VocabularyControllerTest {
    @Autowired
    private MockMvc mvc;
    @MockitoBean
    private VocabularyService service;
    @MockitoBean
    private AuthenticationTokenValidator tokens;
    private final UUID user = UUID.randomUUID();

    @BeforeEach
    void auth() {
        when(tokens.validateAndGetUserId("test")).thenReturn(user);
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/vocabulary/today")).andExpect(status().isUnauthorized());
    }

    @Test
    void returnsDailyLessonCompletionState() throws Exception {
        var words = List.of(new VocabularyService.Word(UUID.randomUUID(), "drawer", "gaveta",
                "In the drawer.", "Na gaveta.", VocabularyCategory.HOUSE,
                VocabularyService.ProgressStatus.NEW, 0, 0, false));
        var progress = new VocabularyService.LessonProgress(true, 4, true, OffsetDateTime.now());
        when(service.today(user)).thenReturn(new VocabularyService.Lesson(UUID.randomUUID(), LocalDate.now(),
                EnglishLevel.B1, VocabularyCategory.HOUSE, words, progress));

        mvc.perform(get("/api/v1/vocabulary/today").header("Authorization", "Bearer test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.words").isArray())
                .andExpect(jsonPath("$.progress.quizCompleted").value(true))
                .andExpect(jsonPath("$.progress.quizScore").value(4))
                .andExpect(jsonPath("$.progress.writingCompleted").value(true))
                .andExpect(jsonPath("$.progress.completedAt").isNotEmpty());
    }

    @Test
    void submitsExactlyFiveQuizAnswersForTheAuthenticatedUser() throws Exception {
        UUID lessonId = UUID.randomUUID();
        List<UUID> words = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID());
        var progress = new VocabularyService.LessonProgress(true, 5, false, null);
        when(service.submitQuiz(eq(user), eq(lessonId), any())).thenReturn(new VocabularyService.QuizResult(5, 5, progress));
        String answers = words.stream().map(word -> "{\"wordId\":\"" + word
                + "\",\"selectedWordId\":\"" + word + "\"}").reduce((left, right) -> left + "," + right).orElseThrow();

        mvc.perform(post("/api/v1/vocabulary/quiz").header("Authorization", "Bearer test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lessonId\":\"" + lessonId + "\",\"answers\":[" + answers + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.score").value(5))
                .andExpect(jsonPath("$.total").value(5));
        verify(service).submitQuiz(eq(user), eq(lessonId), any());
    }

    @Test
    void rejectsQuizWithAnythingOtherThanFiveAnswers() throws Exception {
        UUID lessonId = UUID.randomUUID();
        UUID word = UUID.randomUUID();
        String answer = "{\"wordId\":\"" + word + "\",\"selectedWordId\":\"" + word + "\"}";

        mvc.perform(post("/api/v1/vocabulary/quiz").header("Authorization", "Bearer test")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lessonId\":\"" + lessonId + "\",\"answers\":[" + answer + "]}"))
                .andExpect(status().isBadRequest());
        verify(service, never()).submitQuiz(any(), any(), any());
    }
}
