package com.example.com.englishai.backend.integration;

import com.example.com.englishai.backend.application.conversation.ConversationService;
import com.example.com.englishai.backend.application.reading.ReadingService;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ConversationEntity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.ConversationJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.presentation.rest.admin.AdminUserController;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class HistoryPaginationIntegrationTest {
    @Autowired private UserJpaRepository users;
    @Autowired private ConversationJpaRepository conversations;
    @Autowired private ConversationService conversationService;
    @Autowired private ReadingService readingService;
    @Autowired private AdminUserController adminUsers;
    @Autowired private JdbcTemplate jdbc;
    private final List<UUID> owners = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (UUID owner : owners) {
            jdbc.update("delete from reading_activities where user_id=?", owner);
            jdbc.update("delete from users where id=?", owner);
        }
    }

    @Test
    void conversationMessagesHaveStableFirstAndLastPagesAndOwnership() {
        UUID owner = user("messages", 0);
        UUID other = user("other", 1);
        UUID conversationId = conversation(owner).getId();
        UUID foreignId = conversation(other).getId();
        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).minusDays(1);
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            UUID id = UUID.randomUUID();
            ids.add(id);
            jdbc.update("insert into conversation_messages(id, conversation_id, role, content, created_at) values(?, ?, 'USER', ?, ?)",
                    id, conversationId, "message-" + i, start.plusSeconds(i));
        }
        assertThat(conversationService.history(owner, conversationId, PageRequest.of(0, 50)))
                .extracting(message -> message.getId()).containsExactlyElementsOf(ids.subList(0, 50));
        assertThat(conversationService.history(owner, conversationId, PageRequest.of(2, 50)))
                .extracting(message -> message.getId()).containsExactlyElementsOf(ids.subList(100, 120));
        assertThat(conversationService.history(owner, conversationId, PageRequest.of(3, 50))).isEmpty();
        assertThat(conversationService.history(owner, conversationId)).hasSize(120);
        assertThatThrownBy(() -> conversationService.history(other, conversationId, PageRequest.of(0, 50)))
                .isInstanceOf(java.util.NoSuchElementException.class);
        assertThatThrownBy(() -> conversationService.history(owner, foreignId, PageRequest.of(0, 50)))
                .isInstanceOf(java.util.NoSuchElementException.class);
    }

    @Test
    void conversationListPagesKeepAllEndedHistoryAvailable() {
        UUID owner = user("conversation-list", 0);
        UUID other = user("conversation-other", 1);
        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).minusDays(3);
        for (int i = 0; i < 60; i++) {
            var conversation = new ConversationEntity(UUID.randomUUID(), owner, "FREE_TALK", "en", "Test", start.plusMinutes(i));
            conversation.end(start.plusMinutes(i + 100));
            conversations.save(conversation);
        }
        conversation(other);
        assertThat(conversationService.list(owner, PageRequest.of(0, 25))).hasSize(25);
        assertThat(conversationService.list(owner, PageRequest.of(1, 25))).hasSize(25);
        assertThat(conversationService.list(owner, PageRequest.of(2, 25))).hasSize(10);
        assertThat(conversationService.list(owner, PageRequest.of(3, 25))).isEmpty();
        assertThat(conversationService.list(owner)).hasSize(60);
        assertThat(conversationService.list(owner, PageRequest.of(0, 25)).getFirst().getEndedAt())
                .isAfter(conversationService.list(owner, PageRequest.of(1, 25)).getFirst().getEndedAt());
    }

    @Test
    void readingListUsesSummaryProjectionAndPaginatesByOwner() {
        UUID owner = user("reading", 0);
        UUID other = user("reading-other", 1);
        OffsetDateTime start = OffsetDateTime.now(ZoneOffset.UTC).minusDays(2);
        for (int i = 0; i < 60; i++) {
            jdbc.update("insert into reading_activities(id,user_id,difficulty,topic,title,text,question_count,status,created_at,completed_at) "
                    + "values(?,?,'BEGINNER','TRAVEL',?, ?,3,'SUCCESS',?,?)",
                    UUID.randomUUID(), owner, "Reading " + i, "passage-" + i, start.plusMinutes(i), start.plusMinutes(i + 1));
        }
        jdbc.update("insert into reading_activities(id,user_id,difficulty,topic,title,text,question_count,status,created_at,completed_at) "
                        + "values(?,?,'BEGINNER','TRAVEL','Foreign','foreign passage',3,'SUCCESS',?,?)",
                UUID.randomUUID(), other, start, start.plusMinutes(1));
        assertThat(readingService.listForUser(owner, PageRequest.of(0, 25))).hasSize(25);
        assertThat(readingService.listForUser(owner, PageRequest.of(2, 25))).hasSize(10);
        assertThat(readingService.listForUser(owner, PageRequest.of(3, 25))).isEmpty();
        assertThat(readingService.listForUser(owner)).hasSize(60);
        assertThat(readingService.listForUser(owner, PageRequest.of(0, 25)).getFirst().title()).isEqualTo("Reading 59");
        assertThat(readingService.listForUser(other)).extracting(ReadingService.ActivitySummary::title).containsExactly("Foreign");
        assertThat(readingService.listForUser(user("empty", 2))).isEmpty();
    }

    @Test
    void adminSearchAndOrderingRunInTheDatabaseWithPages() {
        String prefix = "admin-page-" + UUID.randomUUID().toString().substring(0, 8);
        for (int i = 0; i < 60; i++) user(prefix + "-" + i, i);
        var first = users.findSummariesForAdmin(prefix, PageRequest.of(0, 25));
        var last = users.findSummariesForAdmin(prefix, PageRequest.of(2, 25));
        assertThat(first).hasSize(25);
        assertThat(last).hasSize(10);
        assertThat(users.findSummariesForAdmin(prefix, PageRequest.of(3, 25))).isEmpty();
        assertThat(users.findSummariesForAdmin(prefix, org.springframework.data.domain.Pageable.unpaged())).hasSize(60);
        assertThat(first.getFirst().getCreatedAt()).isBeforeOrEqualTo(last.getFirst().getCreatedAt());
        assertThat(adminUsers.list(prefix.toUpperCase(java.util.Locale.ROOT), 0, 25)).hasSize(25);
        assertThat(users.findSummariesForAdmin("no-such-" + prefix, PageRequest.of(0, 25))).isEmpty();
    }

    private UUID user(String label, int minutes) {
        UUID id = UUID.randomUUID();
        OffsetDateTime created = OffsetDateTime.now(ZoneOffset.UTC).minusDays(4).plusMinutes(minutes);
        users.saveAndFlush(new UserEntity(id, label + "-" + id + "@test.com", label, "hash", created, created));
        owners.add(id);
        return id;
    }

    private ConversationEntity conversation(UUID owner) {
        return conversations.saveAndFlush(new ConversationEntity(UUID.randomUUID(), owner, "FREE_TALK", "en", "Test",
                OffsetDateTime.now(ZoneOffset.UTC)));
    }
}
