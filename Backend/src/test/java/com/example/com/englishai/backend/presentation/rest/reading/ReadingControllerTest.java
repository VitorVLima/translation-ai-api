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
import java.util.*;
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
        when(service.generate(ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL))
                .thenReturn(new ReadingService.Reading("We visited a village.", ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL));
        mvc.perform(post("/api/v1/reading/generate").header("Authorization", "Bearer test").contentType("application/json")
                .content("{\"difficulty\":\"INTERMEDIATE\",\"topic\":\"TRAVEL\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.text").value("We visited a village.")).andExpect(jsonPath("$.difficulty").value("INTERMEDIATE"));
        when(service.hint("We visited a village.", ConversationDifficulty.INTERMEDIATE)).thenReturn(new ReadingService.Hints(List.of()));
        mvc.perform(post("/api/v1/reading/hint").header("Authorization", "Bearer test").contentType("application/json")
                .content("{\"text\":\"We visited a village.\",\"difficulty\":\"INTERMEDIATE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
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
}
