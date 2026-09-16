package com.example.com.englishai.backend.integration.conversation;

import com.example.com.englishai.backend.application.chat.*;
import com.example.com.englishai.backend.application.catalog.AssistantIdentityResolver;
import com.example.com.englishai.backend.application.conversation.*;
import com.example.com.englishai.backend.application.profile.ProfileService;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest
class ConversationLimitIntegrationTest {
    @Autowired UserJpaRepository users;
    @Autowired ConversationJpaRepository conversations;
    @Autowired ConversationMessageJpaRepository messages;
    @Autowired ScenarioDefinitionJpaRepository scenarios;
    @Autowired ProfileService profiles;
    @Autowired AssistantIdentityResolver identities;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;
    final List<UUID> owners = new ArrayList<>();
    ChatWithTutor chat;
    ConversationService service;

    @BeforeEach void setup() {
        chat = mock(ChatWithTutor.class);
        when(chat.opening(any(), anyString())).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return new ChatWithTutorResult("Welcome.", false, null);
        });
        service = new ConversationService(conversations, messages, chat, profiles, scenarios, identities, transactions, users);
    }
    @AfterEach void cleanup() {
        owners.forEach(id -> jdbc.update("delete from users where id = ?", id));
    }
    UUID owner(int count) {
        var id = UUID.randomUUID(); var now = OffsetDateTime.now();
        users.saveAndFlush(new UserEntity(id, "limit-" + id + "@test.com", "limit-" + id, "test-hash", now, now, false));
        owners.add(id);
        for (int i = 0; i < count; i++) conversations.saveAndFlush(new ConversationEntity(UUID.randomUUID(), id, "FREE_TALK", "en", "Test", now));
        return id;
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {0, 2})
    void availableSlotCreatesConversationAndOpening(int initial) {
        UUID id = owner(initial);
        var result = service.create(id, "FREE_TALK", "en");
        assertThat(conversations.countByUserId(id)).isEqualTo(initial + 1);
        assertThat(messages.findByConversationIdOrderByCreatedAtAsc(result.getId())).extracting(ConversationMessageEntity::getRole).containsExactly("ASSISTANT");
    }
    @Test void fullUserIsRejectedBeforeLlmAndAnotherUserStillHasSlots() {
        UUID full = owner(3), other = owner(0);
        assertThatThrownBy(() -> service.create(full, "FREE_TALK", "en")).isInstanceOf(ConversationLimitReachedException.class);
        verifyNoInteractions(chat);
        service.create(other, "FREE_TALK", "en");
        assertThat(conversations.countByUserId(full)).isEqualTo(3);
        assertThat(conversations.countByUserId(other)).isEqualTo(1);
    }
    @Test void deletingOwnedConversationReleasesSlot() {
        UUID id = owner(3);
        service.delete(id, service.list(id).getFirst().getId());
        service.create(id, "FREE_TALK", "en");
        assertThat(conversations.countByUserId(id)).isEqualTo(3);
    }
    @Test void concurrentGenerationsCannotBothClaimLastSlot() throws Exception {
        UUID id = owner(2);
        var barrier = new CyclicBarrier(2);
        when(chat.opening(any(), anyString())).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            barrier.await(10, TimeUnit.SECONDS);
            return new ChatWithTutorResult("Welcome.", false, null);
        });
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> create = () -> {
                try { service.create(id, "FREE_TALK", "en"); return true; }
                catch (ConversationLimitReachedException expected) { return false; }
            };
            var first = executor.submit(create); var second = executor.submit(create);
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        assertThat(conversations.countByUserId(id)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from conversation_messages m join conversations c on c.id=m.conversation_id where c.user_id=?", Long.class, id)).isEqualTo(1);
    }
}
