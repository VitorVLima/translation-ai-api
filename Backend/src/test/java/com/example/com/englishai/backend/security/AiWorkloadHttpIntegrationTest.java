package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.application.chat.ChatWithTutor;
import com.example.com.englishai.backend.application.chat.ChatWithTutorResult;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.RefreshTokenFamilyEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.RefreshTokenFamilyJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "AI_LLM_PER_OPERATION_MINUTE=1")
class AiWorkloadHttpIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AuthenticationTokenGenerator tokens;
    @Autowired UserJpaRepository users;
    @Autowired RefreshTokenFamilyJpaRepository families;
    @MockitoBean ChatWithTutor chat;

    @Test void realJwtChainLimitsOneAccountAndPreservesAnother() throws Exception {
        UUID first = UUID.randomUUID(), second = UUID.randomUUID();
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        users.saveAndFlush(new UserEntity(first, "ai-limit-" + first + "@test.com",
                "ailimit" + first.toString().replace("-", ""), "hash", now, now));
        users.saveAndFlush(new UserEntity(second, "ai-limit-" + second + "@test.com",
                "ailimit" + second.toString().replace("-", ""), "hash", now, now));
        try {
            when(chat.execute(any())).thenReturn(new ChatWithTutorResult("Hello", false, null));
            String body = "{\"message\":\"Hello\",\"language\":\"en\"}";
            UUID firstFamily = UUID.randomUUID(), secondFamily = UUID.randomUUID();
            families.saveAndFlush(new RefreshTokenFamilyEntity(firstFamily, first, now, now.plusDays(7), null));
            families.saveAndFlush(new RefreshTokenFamilyEntity(secondFamily, second, now, now.plusDays(7), null));
            String firstToken = tokens.generate(first, firstFamily), secondToken = tokens.generate(second, secondFamily);
            mvc.perform(post("/api/v1/chat").header("Authorization", "Bearer " + firstToken)
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
            mvc.perform(post("/api/v1/chat").header("Authorization", "Bearer " + firstToken)
                    .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
            mvc.perform(post("/api/v1/chat").header("Authorization", "Bearer " + secondToken)
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        } finally {
            users.deleteById(first); users.deleteById(second);
        }
    }
}
