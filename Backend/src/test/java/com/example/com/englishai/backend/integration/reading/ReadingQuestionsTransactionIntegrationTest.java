package com.example.com.englishai.backend.integration.reading;

import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
import com.example.com.englishai.backend.application.llm.LlmResponse;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenGenerator;
import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.ports.RefreshTokenHasher;
import com.example.com.englishai.backend.application.reading.*;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest
@AutoConfigureMockMvc
class ReadingQuestionsTransactionIntegrationTest {
    @Autowired ReadingService service;
    @Autowired UserJpaRepository users;
    @Autowired ReadingActivityJpaRepository activities;
    @Autowired ReadingQuestionJpaRepository questions;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired AuthenticationTokenGenerator tokenGenerator;
    @Autowired AuthenticationTokenValidator tokenValidator;
    @Autowired RefreshTokenHasher refreshTokenHasher;
    @MockitoBean LlmProvider provider;
    final List<UUID> owners = new ArrayList<>();
    final OffsetDateTime now = OffsetDateTime.parse("2026-09-17T12:00:00Z");

    @BeforeEach void setup() {
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"questions\":["
                + "{\"id\":1,\"type\":\"MAIN_IDEA\",\"question\":\"What is the topic?\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctOption\":0,\"explanation\":\"A.\"},"
                + "{\"id\":2,\"type\":\"DETAIL\",\"question\":\"Where?\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctOption\":1,\"explanation\":\"B.\"},"
                + "{\"id\":3,\"type\":\"VOCABULARY\",\"question\":\"Meaning?\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctOption\":2,\"explanation\":\"C.\"}]}"));
    }

    @AfterEach void cleanup() {
        for (UUID owner : owners) {
            jdbc.update("delete from reading_questions where activity_id in (select id from reading_activities where user_id=?)", owner);
            jdbc.update("delete from reading_activities where user_id=?", owner);
            jdbc.update("delete from refresh_tokens where user_id=?", owner);
            jdbc.update("delete from refresh_token_families where user_id=?", owner);
            jdbc.update("delete from users where id=?", owner);
        }
    }

    @Test void questionsForActivityRunsWithPessimisticLockInsideTransactionAndIsIdempotent() {
        UUID owner = UUID.randomUUID(); owners.add(owner);
        users.saveAndFlush(new UserEntity(owner, "reading-" + owner + "@test.com", "reading" + owner.toString().replace("-", ""), "hash", now, now));
        UUID activityId = UUID.randomUUID();
        activities.saveAndFlush(new ReadingActivityEntity(activityId, owner, ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL, "We visited a village.", now));

        ReadingService.Questions first = service.questionsForActivity(owner, activityId);
        ReadingService.Questions second = service.questionsForActivity(owner, activityId);

        assertThat(first.questions()).hasSize(3);
        assertThat(first.questions()).allSatisfy(question -> assertThat(question.id()).isNotNull());
        assertThat(second.questions()).isEqualTo(first.questions());
        assertThat(questions.findByActivityIdOrderByQuestionNumber(activityId)).hasSize(3);
        verify(provider, times(1)).complete(any());
    }

    @Test void concurrentRequestsReuseTheThreePersistedQuestions() throws Exception {
        UUID owner = UUID.randomUUID(); owners.add(owner);
        users.saveAndFlush(new UserEntity(owner, "reading-concurrent-" + owner + "@test.com", "readingc" + owner.toString().replace("-", ""), "hash", now, now));
        UUID activityId = UUID.randomUUID();
        activities.saveAndFlush(new ReadingActivityEntity(activityId, owner, ConversationDifficulty.INTERMEDIATE, ReadingTopic.TRAVEL, "We visited a village.", now));
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> service.questionsForActivity(owner, activityId));
            var second = pool.submit(() -> service.questionsForActivity(owner, activityId));
            assertThat(first.get(20, TimeUnit.SECONDS).questions()).hasSize(3);
            assertThat(second.get(20, TimeUnit.SECONDS).questions()).hasSize(3);
        }
        assertThat(questions.findByActivityIdOrderByQuestionNumber(activityId)).hasSize(3);
        verify(provider, times(1)).complete(any());
    }

    @Test
    void httpRequestTraversesControllerAndTransactionalServiceProxy() throws Exception {
        UUID owner = UUID.randomUUID(); owners.add(owner);
        users.saveAndFlush(new UserEntity(owner, "reading-http-" + owner + "@test.com",
                "readinghttp" + owner.toString().replace("-", ""), "hash", now, now));
        UUID activityId = UUID.randomUUID();
        activities.saveAndFlush(new ReadingActivityEntity(activityId, owner, ConversationDifficulty.INTERMEDIATE,
                ReadingTopic.TRAVEL, "We visited a village.", now));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/reading/questions")
                        .with(authentication(new UsernamePasswordAuthenticationToken(owner, null, List.of())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"activityId\":\"" + activityId + "\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.questions").isArray())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.questions.length()").value(3));

        assertThat(questions.findByActivityIdOrderByQuestionNumber(activityId)).hasSize(3);
        verify(provider, times(1)).complete(any());
    }

    @Test
    void realJwtFilterAcceptsAccessTokenForSubmitAndControllerReceivesPrincipal() throws Exception {
        UUID owner = UUID.randomUUID(); owners.add(owner);
        users.saveAndFlush(new UserEntity(owner, "reading-jwt-" + owner + "@test.com",
                "readingjwt" + owner.toString().replace("-", ""), "hash", now, now));
        UUID activityId = UUID.randomUUID();
        activities.saveAndFlush(new ReadingActivityEntity(activityId, owner, ConversationDifficulty.INTERMEDIATE,
                ReadingTopic.TRAVEL, "We visited a village.", now));

        String token = tokenGenerator.generate(owner);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/reading/questions")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"activityId\":\"" + activityId + "\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.questions").isArray());
        var persisted = questions.findByActivityIdOrderByQuestionNumber(activityId);
        String answers = persisted.stream().map(q -> "{\"questionId\":\"" + q.getId() + "\",\"selectedOption\":0}").collect(java.util.stream.Collectors.joining(",", "{\"answers\":[", "]}"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/reading/" + activityId + "/submit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(answers))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
    }

    @Test
    void refreshEndpointIssuesAccessTokenAcceptedByFilterForReadingSubmit() throws Exception {
        UUID owner = UUID.randomUUID(); owners.add(owner);
        users.saveAndFlush(new UserEntity(owner, "reading-refresh-" + owner + "@test.com",
                "readingrefresh" + owner.toString().replace("-", ""), "hash", now, now));
        UUID activityId = UUID.randomUUID();
        activities.saveAndFlush(new ReadingActivityEntity(activityId, owner, ConversationDifficulty.INTERMEDIATE,
                ReadingTopic.TRAVEL, "We visited a village.", now));
        UUID familyId = UUID.randomUUID();
        String rawRefresh = "reading-refresh-" + UUID.randomUUID();
        jdbc.update("insert into refresh_token_families (id, user_id, created_at, expires_at) values (?, ?, ?, ?)", familyId, owner, now, now.plusDays(7));
        jdbc.update("insert into refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at) values (?, ?, ?, ?, ?, ?)", UUID.randomUUID(), owner, familyId, refreshTokenHasher.hash(rawRefresh), now.plusDays(7), now);

        String refreshBody = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"" + rawRefresh + "\"}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andReturn().getResponse().getContentAsString();
        String refreshedAccess = new com.fasterxml.jackson.databind.ObjectMapper().readTree(refreshBody).path("accessToken").asText();
        assertThat(refreshedAccess).isNotBlank();
        assertThat(tokenValidator.validateAndGetUserId(refreshedAccess)).isEqualTo(owner);

        service.questionsForActivity(owner, activityId);
        var persisted = questions.findByActivityIdOrderByQuestionNumber(activityId);
        String answers = persisted.stream().map(q -> "{\"questionId\":\"" + q.getId() + "\",\"selectedOption\":0}").collect(java.util.stream.Collectors.joining(",", "{\"answers\":[", "]}"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/reading/" + activityId + "/submit")
                        .header("Authorization", "Bearer " + refreshedAccess)
                        .contentType(MediaType.APPLICATION_JSON).content(answers))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
    }

    @Test
    void nonUuidQuestionIdIsRejectedAsBadRequestBeforeReadingController() throws Exception {
        UUID owner = UUID.randomUUID(); owners.add(owner);
        users.saveAndFlush(new UserEntity(owner, "reading-invalid-id-" + owner + "@test.com",
                "readinginvalid" + owner.toString().replace("-", ""), "hash", now, now));
        String token = tokenGenerator.generate(owner);
        String body = "{\"answers\":[{\"questionId\":\"1\",\"selectedOption\":0},"
                + "{\"questionId\":\"1\",\"selectedOption\":0},{\"questionId\":\"1\",\"selectedOption\":0}]}";

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/v1/reading/" + UUID.randomUUID() + "/submit")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isBadRequest());
    }
}
