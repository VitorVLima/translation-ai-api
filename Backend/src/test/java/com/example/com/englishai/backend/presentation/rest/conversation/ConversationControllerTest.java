package com.example.com.englishai.backend.presentation.rest.conversation;

import com.example.com.englishai.backend.application.conversation.ConversationService;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationEntity;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.OffsetDateTime;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ConversationController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class ConversationControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ConversationService service;
    @MockitoBean AuthenticationTokenValidator tokens;
    @MockitoBean com.example.com.englishai.backend.infrastructure.persistence.repository.ScenarioDefinitionJpaRepository definitions;
    @MockitoBean com.example.com.englishai.backend.application.catalog.AssistantIdentityResolver identities;

    @org.junit.jupiter.api.BeforeEach void catalog() {
        when(identities.resolve("interviewer_default")).thenReturn(new com.example.com.englishai.backend.application.catalog.AssistantIdentityResolver.AssistantIdentity(
                "Rodrigo", "interviewer_default", "/api/v1/avatars/interviewer_default/image"));
        when(definitions.findByScenarioKey("JOB_INTERVIEW")).thenReturn(Optional.of(
                new com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationScenarioDefinitionEntity(
                        UUID.randomUUID(), "JOB_INTERVIEW", "Interview", "Practice an interview", "Rodrigo", "interviewer_default",
                        "Act as an interviewer.", true, 0, OffsetDateTime.now())));
    }


    @Test void creationUsesPrincipalAndReturnsExistingPublicDtoWithoutPrompt() throws Exception {
        var owner = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test-token")).thenReturn(owner);
        when(service.create(owner,"JOB_INTERVIEW","en")).thenReturn(new ConversationEntity(UUID.randomUUID(),owner,
                "JOB_INTERVIEW","en","Interview",OffsetDateTime.now()));
        mvc.perform(post("/api/v1/conversations").header("Authorization","Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"scenario\":\"JOB_INTERVIEW\",\"language\":\"en\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.behaviorInstructions").doesNotExist())
                .andExpect(jsonPath("$.systemPrompt").doesNotExist());
        verify(service).create(owner,"JOB_INTERVIEW","en");
    }

    @Test void foreignIdsReturn404ForReadSendStreamAndDelete() throws Exception {
        var owner = UUID.randomUUID(); var foreignId = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test-token")).thenReturn(owner);
        when(service.require(owner,foreignId)).thenThrow(new NoSuchElementException("Conversation not found"));
        when(service.chat(owner,foreignId,"Hi")).thenThrow(new NoSuchElementException("Conversation not found"));
        doThrow(new NoSuchElementException("Conversation not found")).when(service).delete(owner,foreignId);
        String path = "/api/v1/conversations/" + foreignId;
        mvc.perform(get(path).header("Authorization","Bearer test-token")).andExpect(status().isNotFound());
        mvc.perform(delete(path).header("Authorization","Bearer test-token")).andExpect(status().isNotFound());
        for (String suffix : List.of("/messages", "/messages/stream")) {
            mvc.perform(post(path + suffix).header("Authorization","Bearer test-token")
                    .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"Hi\"}"))
                    .andExpect(status().isNotFound());
        }
    }

    @Test void creationRequiresAuthentication() throws Exception {
        mvc.perform(post("/api/v1/conversations").contentType(MediaType.APPLICATION_JSON)
                .content("{\"scenario\":\"JOB_INTERVIEW\",\"language\":\"en\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test void openingProviderFailureReturnsRecoverable503() throws Exception {
        var owner = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test-token")).thenReturn(owner);
        when(service.create(owner,"JOB_INTERVIEW","en")).thenThrow(
                new com.example.com.englishai.backend.application.llm.LlmProviderException("unavailable"));
        mvc.perform(post("/api/v1/conversations").header("Authorization","Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"scenario\":\"JOB_INTERVIEW\",\"language\":\"en\"}"))
                .andExpect(status().isServiceUnavailable());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
            "{\"language\":\"en\"}", "{\"scenario\":null,\"language\":\"en\"}",
            "{\"scenario\":\"\",\"language\":\"en\"}"})
    void missingScenarioIsRejectedBeforeService(String json) throws Exception {
        when(tokens.validateAndGetUserId("test-token")).thenReturn(UUID.randomUUID());
        mvc.perform(post("/api/v1/conversations").header("Authorization","Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @Test void unknownScenarioReturns404() throws Exception {
        var owner = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test-token")).thenReturn(owner);
        when(service.create(owner,"NONEXISTENT","en")).thenThrow(new NoSuchElementException("Scenario not found"));
        mvc.perform(post("/api/v1/conversations").header("Authorization","Bearer test-token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"scenario\":\"NONEXISTENT\",\"language\":\"en\"}"))
                .andExpect(status().isNotFound());
    }

    @Test void reopenReturnsOriginalScenarioIdentityAndStoredHistoryWithoutCreation() throws Exception {
        var owner = UUID.randomUUID(); var id = UUID.randomUUID(); var now = OffsetDateTime.now();
        when(tokens.validateAndGetUserId("test-token")).thenReturn(owner);
        when(service.require(owner,id)).thenReturn(new ConversationEntity(id,owner,"JOB_INTERVIEW","en","Interview",now));
        when(service.history(owner,id)).thenReturn(List.of(
                new com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationMessageEntity(
                        UUID.randomUUID(),id,"ASSISTANT","Welcome to the interview.",null,now)));
        mvc.perform(get("/api/v1/conversations/"+id).header("Authorization","Bearer test-token"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.conversation.scenario").value("JOB_INTERVIEW"))
                .andExpect(jsonPath("$.conversation.assistantDisplayName").value("Rodrigo"))
                .andExpect(jsonPath("$.conversation.assistantAvatarKey").value("interviewer_default"))
                .andExpect(jsonPath("$.messages[0].role").value("ASSISTANT"))
                .andExpect(jsonPath("$.messages[0].content").value("Welcome to the interview."));
        verify(service,never()).create(any(),anyString(),anyString());
    }

    @Test void orphanedScenarioCannotBeDisplayedAsFreeTalk() throws Exception {
        var owner = UUID.randomUUID(); var id = UUID.randomUUID();
        when(tokens.validateAndGetUserId("test-token")).thenReturn(owner);
        when(service.require(owner,id)).thenReturn(new ConversationEntity(id,owner,"MISSING_SCENARIO","en","Old",OffsetDateTime.now()));
        mvc.perform(get("/api/v1/conversations/"+id).header("Authorization","Bearer test-token"))
                .andExpect(status().isNotFound());
        verify(service,never()).history(any(),any());
    }

}
