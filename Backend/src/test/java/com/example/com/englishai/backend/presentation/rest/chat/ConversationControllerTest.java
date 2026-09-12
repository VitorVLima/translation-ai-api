package com.example.com.englishai.backend.presentation.rest.chat;

import com.example.com.englishai.backend.application.chat.ChatWithTutor;
import com.example.com.englishai.backend.application.chat.ChatWithTutorResult;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.argThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ConversationController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class ConversationControllerTest {
    @Autowired MockMvc mockMvc;
    @MockitoBean ChatWithTutor chat;
    @MockitoBean AuthenticationTokenValidator tokenValidator;

    @Test void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(post("/api/v1/chat").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Hi\",\"language\":\"en\"}"))
                .andExpect(status().isUnauthorized());
    }
    @Test void unauthenticatedStreamRequestIsRejected() throws Exception {
        mockMvc.perform(post("/api/v1/chat/stream").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Hi\",\"language\":\"en\"}"))
                .andExpect(status().isUnauthorized());
    }
    @Test void authenticatedRequestReturnsStructuredResponseAndNoStore() throws Exception {
        when(tokenValidator.validateAndGetUserId("token")).thenReturn(UUID.randomUUID());
        when(chat.execute(org.mockito.ArgumentMatchers.any())).thenReturn(new ChatWithTutorResult("Hello!", true, "Hello!"));
        mockMvc.perform(post("/api/v1/chat").header("Authorization", "Bearer token").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Helo\",\"language\":\"en\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.reply").value("Hello!")).andExpect(jsonPath("$.hasCorrection").value(true)).andExpect(jsonPath("$.correctedText").value("Hello!"));
    }
    @Test void invalidRequestIsBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/chat").header("Authorization", "Bearer token").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\" \" ,\"language\":\"fr\"}"))
                .andExpect(status().isBadRequest());
    }
    @Test void acceptsHistoryAndPassesItToUseCase() throws Exception {
        when(tokenValidator.validateAndGetUserId("token")).thenReturn(UUID.randomUUID());
        when(chat.execute(org.mockito.ArgumentMatchers.any())).thenReturn(new ChatWithTutorResult("It is Red Dead Redemption 2.", false, null));
        mockMvc.perform(post("/api/v1/chat").header("Authorization", "Bearer token").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"message\":\"What is my favorite game?\",\"language\":\"en\",\"history\":[{\"role\":\"user\",\"content\":\"My favorite game is Red Dead Redemption 2.\"},{\"role\":\"assistant\",\"content\":\"That is a great game.\"}]}"))
                .andExpect(status().isOk());
        verify(chat).execute(argThat(command -> command.history().size() == 2
                && command.history().get(0).role().code().equals("user")
                && command.history().get(1).role().code().equals("assistant")));
    }
}
