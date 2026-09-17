package com.example.com.englishai.backend.integration.conversation;

import com.example.com.englishai.backend.application.conversation.*;
import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.infrastructure.persistence.entity.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@SpringBootTest
class ConversationEvaluationIntegrationTest {
    @Autowired ConversationJpaRepository conversations;
    @Autowired ConversationMessageJpaRepository messages;
    @Autowired ConversationEvaluationJpaRepository evaluations;
    @Autowired UserJpaRepository users;
    @Autowired ConversationService chat;
    @Autowired PlatformTransactionManager manager;
    @Autowired JdbcTemplate jdbc;
    final LlmProvider provider=mock(LlmProvider.class);
    final List<UUID> owners=new ArrayList<>();
    final OffsetDateTime now=OffsetDateTime.parse("2026-09-16T12:00:00Z");
    TransactionTemplate tx;
    ConversationEvaluationService service;
    @BeforeEach void setup() {
        tx=new TransactionTemplate(manager);
        service=new ConversationEvaluationService(conversations,messages,evaluations,provider,Clock.fixed(now.toInstant(),ZoneOffset.UTC));
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"communication\":80,\"grammar\":70,\"vocabulary\":75,\"fluency\":79,\"relevance\":80,\"strengths\":[\"Boa comunicação.\"],\"improvements\":[\"Varie os conectores.\"]}"));
    }
    @AfterEach void cleanup() {
        for(var owner:owners) {
            jdbc.update("delete from conversations where user_id=?",owner);
            jdbc.update("delete from users where id=?",owner);
        }
    }
    UUID user() {
        var id=UUID.randomUUID();owners.add(id);
        users.saveAndFlush(new UserEntity(id,"evaluation-"+id+"@test.com","eval"+id.toString().replace("-",""),"hash",now,now));
        return id;
    }
    ConversationEntity conversation(UUID owner,int count) {
        var c=conversations.saveAndFlush(new ConversationEntity(UUID.randomUUID(),owner,"RESTAURANT","en","Practice",now));
        for(int i=0;i<count;i++) {
            messages.saveAndFlush(new ConversationMessageEntity(UUID.randomUUID(),c.getId(),"ASSISTANT","What would you like?",null,now.plusSeconds(i*2)));
            messages.saveAndFlush(new ConversationMessageEntity(UUID.randomUUID(),c.getId(),"USER","I would like some tea please.",null,now.plusSeconds(i*2+1)));
        }
        return c;
    }
    ConversationEvaluationService.Evaluation complete(UUID owner, UUID id) {return tx.execute(s -> service.complete(owner,id));}

    @Test void twoUsersReloadOwnershipHistoryAndEndedConversationAreIndependent() {
        var a=user();var b=user();var ca=conversation(a,4);var cb=conversation(b,4);
        assertThatThrownBy(() -> complete(b,ca.getId())).isInstanceOf(NoSuchElementException.class);
        assertThatThrownBy(() -> service.get(b,ca.getId())).isInstanceOf(NoSuchElementException.class);
        var result=complete(a,ca.getId());
        assertThat(result.scores().overall()).isEqualTo(77);
        assertThat(service.get(a,ca.getId())).isEqualTo(result);
        assertThat(complete(a,ca.getId())).isEqualTo(result);
        assertThat(conversations.findById(ca.getId()).orElseThrow().getEndedAt()).isEqualTo(now);
        assertThat(conversations.findById(cb.getId()).orElseThrow().getEndedAt()).isNull();
        assertThat(evaluations.findByConversationId(cb.getId())).isEmpty();
        assertThat(messages.findByConversationIdOrderByCreatedAtAsc(ca.getId())).hasSize(8);
        assertThatThrownBy(() -> chat.chat(a,ca.getId(),"Hello")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> chat.stream(a,ca.getId(),"Hello",part -> {})).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> chat.addMessage(a,ca.getId(),"USER","Hello",null)).isInstanceOf(IllegalStateException.class);
        verify(provider,times(1)).complete(any());
    }
    @Test void simultaneousCompletionCallsProviderOnceAndUniqueConstraintProtectsResult() throws Exception {
        var owner=user();var c=conversation(owner,4);
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<ConversationEvaluationService.Evaluation> call=() -> {start.await();return complete(owner,c.getId());};
            var first=pool.submit(call);var second=pool.submit(call);start.countDown();
            assertThat(first.get(15,TimeUnit.SECONDS)).isEqualTo(second.get(15,TimeUnit.SECONDS));
        }
        verify(provider,times(1)).complete(any());
        assertThat(jdbc.queryForObject("select count(*) from conversation_evaluations where conversation_id=?",Integer.class,c.getId())).isEqualTo(1);
        assertThatThrownBy(() -> tx.execute(s -> evaluations.saveAndFlush(new ConversationEvaluationEntity(UUID.randomUUID(),c,60,60,60,60,60,
                ConversationEvaluationService.Result.SUCCESS,"[]","[]",now)))).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(service.get(owner,c.getId()).scores().overall()).isEqualTo(77);
    }
    @Test void invalidProviderRollsBackAndRetryWorks() {
        var owner=user();var c=conversation(owner,4);
        when(provider.complete(any())).thenReturn(new LlmResponse("{}"));
        assertThatThrownBy(() -> complete(owner,c.getId())).isInstanceOf(LlmProviderException.class);
        assertThat(conversations.findById(c.getId()).orElseThrow().getEndedAt()).isNull();
        assertThat(evaluations.findByConversationId(c.getId())).isEmpty();
        assertThat(messages.findByConversationIdOrderByCreatedAtAsc(c.getId())).hasSize(8);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"communication\":30,\"grammar\":30,\"vocabulary\":30,\"fluency\":30,\"relevance\":30,\"strengths\":[],\"improvements\":[\"Continue praticando.\"]}"));
        assertThat(complete(owner,c.getId()).status()).isEqualTo(ConversationEvaluationService.Result.NEEDS_PRACTICE);
    }
    @Test void insufficientExcludesAssistantAndNonLinguisticMessagesAndKeepsActive() {
        var owner=user();var c=conversation(owner,3);
        for(var text:List.of("", "   ", "12345", "...")) messages.saveAndFlush(new ConversationMessageEntity(UUID.randomUUID(),c.getId(),"USER",text,null,now));
        var result=complete(owner,c.getId());
        assertThat(result.currentUserMessages()).isEqualTo(3);
        assertThat(result.status()).isEqualTo(ConversationEvaluationService.Result.INSUFFICIENT);
        assertThat(conversations.findById(c.getId()).orElseThrow().getEndedAt()).isNull();
        assertThat(evaluations.findByConversationId(c.getId())).isEmpty();
        verifyNoInteractions(provider);
    }
    @Test void incompleteTurnCannotBeEvaluated() {
        var owner=user();var c=conversation(owner,4);
        tx.executeWithoutResult(s -> {var active=conversations.findForUpdateByIdAndUserId(c.getId(),owner).orElseThrow();active.beginResponse();});
        assertThatThrownBy(() -> complete(owner,c.getId())).isInstanceOf(IllegalStateException.class);
        assertThat(evaluations.findByConversationId(c.getId())).isEmpty();
        verifyNoInteractions(provider);
    }

    @Test void failureAfterEvaluationInsertRollsBackBothEvaluationAndEndState() {
        var owner=user();var c=conversation(owner,4);
        var failing=mock(ConversationJpaRepository.class,org.mockito.AdditionalAnswers.delegatesTo(conversations));
        doThrow(new IllegalStateException("Write failed")).when(failing).saveAndFlush(any());
        var isolated=new ConversationEvaluationService(failing,messages,evaluations,provider);
        assertThatThrownBy(() -> tx.execute(s -> isolated.complete(owner,c.getId()))).isInstanceOf(IllegalStateException.class);
        assertThat(evaluations.findByConversationId(c.getId())).isEmpty();
        assertThat(conversations.findById(c.getId()).orElseThrow().getEndedAt()).isNull();
        assertThat(complete(owner,c.getId()).status()).isEqualTo(ConversationEvaluationService.Result.SUCCESS);
    }
}
