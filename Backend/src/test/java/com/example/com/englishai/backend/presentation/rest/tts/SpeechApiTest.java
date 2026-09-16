package com.example.com.englishai.backend.presentation.rest.tts;

import com.example.com.englishai.backend.application.ports.*;
import com.example.com.englishai.backend.application.tts.*;
import com.example.com.englishai.backend.application.admin.CatalogService;
import com.example.com.englishai.backend.application.profile.ProfileImageStorage;
import com.example.com.englishai.backend.domain.user.UserRole;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.admin.*;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({TextToSpeechController.class, AdminTtsController.class, AdminCatalogController.class})
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class SpeechApiTest {
    @Autowired MockMvc mvc;
    @MockitoBean SynthesizeSpeech speech;
    @MockitoBean ConversationSpeech conversationSpeech;
    @MockitoBean AuthenticationTokenValidator tokens;
    @MockitoBean UserJpaRepository users;
    @MockitoBean TextToSpeechProvider provider;
    @MockitoBean CatalogService catalog;
    @MockitoBean ProfileImageStorage storage;
    UUID owner = UUID.randomUUID();
    UserEntity user;
    @BeforeEach void setup() {
        user = mock(UserEntity.class);
        when(user.getRole()).thenReturn(UserRole.USER);
        when(users.findById(owner)).thenReturn(Optional.of(user));
        when(tokens.validateAndGetUserId("test")).thenReturn(owner);
    }
    @Test void genericSpeechRemainsCompatibleForTextTools() throws Exception {
        when(speech.execute(any())).thenReturn(new SynthesizeSpeechResult(new byte[]{1,2}, "audio/wav"));
        mvc.perform(post("/api/v1/speech").header("Authorization", "Bearer test").contentType("application/json")
                .content("{\"text\":\"Hello\",\"language\":\"en\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Content-Type", "audio/wav"))
                .andExpect(header().string("Cache-Control", "no-store"));
        verifyNoInteractions(conversationSpeech);
    }
    @Test void chatUsesPrincipalAndConversationContextAndForeignConversationReturns404() throws Exception {
        UUID id = UUID.randomUUID();
        when(conversationSpeech.execute(owner, id, "Hello")).thenReturn(new SynthesizeSpeechResult(new byte[]{1}, "audio/wav"));
        String body = "{\"text\":\"Hello\",\"language\":\"pt\",\"conversationId\":\"" + id + "\"}";
        mvc.perform(post("/api/v1/speech").header("Authorization", "Bearer test").contentType("application/json").content(body)).andExpect(status().isOk());
        verifyNoInteractions(speech);
        when(conversationSpeech.execute(owner, id, "Hello")).thenThrow(new NoSuchElementException());
        mvc.perform(post("/api/v1/speech").header("Authorization", "Bearer test").contentType("application/json").content(body)).andExpect(status().isNotFound());
    }
    @Test void voiceCatalogIsAdminOnlyAndHasNoInternalPaths() throws Exception {
        mvc.perform(get("/api/v1/admin/tts/voices")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/tts/voices").header("Authorization", "Bearer test")).andExpect(status().isForbidden());
        when(provider.voices()).thenReturn(List.of(new TtsVoice("en_US-lessac-high", "Lessac High", "en")));
        for (var role : List.of(UserRole.ADMIN, UserRole.SUPER_ADMIN)) {
            when(user.getRole()).thenReturn(role);
            mvc.perform(get("/api/v1/admin/tts/voices").header("Authorization", "Bearer test"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$[0].displayName").value("Lessac High"))
                    .andExpect(jsonPath("$[0].path").doesNotExist());
        }
    }
    @Test void invalidAdminRateIsRejectedBeforeCatalogSave() throws Exception {
        when(user.getRole()).thenReturn(UserRole.ADMIN);
        mvc.perform(post("/api/v1/admin/conversation-scenarios").header("Authorization", "Bearer test").contentType("application/json")
                .content("{\"key\":\"TEST_VOICE\",\"displayName\":\"Test\",\"description\":\"Test\",\"assistantDisplayName\":\"Legacy\",\"assistantAvatarKey\":\"avatar\",\"behaviorInstructions\":\"Behavior\",\"enabled\":true,\"sortOrder\":0,\"speechRate\":1.26}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.speechRate").exists());
        verifyNoInteractions(catalog);
    }
}
