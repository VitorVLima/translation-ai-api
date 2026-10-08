package com.example.com.englishai.backend.integration.progress;

import com.example.com.englishai.backend.application.progress.*;
import com.example.com.englishai.backend.infrastructure.persistence.repository.*;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
class ProgressQueryIntegrationTest {
    @Autowired UserJpaRepository users;
    @Autowired ProgressQueryRepository queries;
    @Autowired JdbcTemplate jdbc;
    final List<UUID> owners=new ArrayList<>();
    final Instant now=Instant.parse("2026-09-16T12:00:00Z");
    final Clock clock=Clock.fixed(now,ZoneOffset.UTC);
    @BeforeEach void setup(){jdbc.queryForList("select id from users where email like 'progress-%@test.com'",UUID.class).forEach(this::delete);}
    @AfterEach void cleanup(){owners.forEach(this::delete);}
    void delete(UUID id){jdbc.update("delete from reading_activities where user_id=?",id);jdbc.update("delete from user_vocabulary_words where user_id=?",id);jdbc.update("delete from vocabulary_lessons where user_id=?",id);jdbc.update("delete from conversations where user_id=?",id);jdbc.update("delete from users where id=?",id);}
    OffsetDateTime od(Instant instant){return instant.atOffset(ZoneOffset.UTC);}
    UUID user(){UUID id=UUID.randomUUID();owners.add(id);users.saveAndFlush(new UserEntity(id,"progress-"+id+"@test.com","progress"+id.toString().replace("-",""),"hash",OffsetDateTime.parse("2026-09-01T00:00:00Z"),OffsetDateTime.parse("2026-09-01T00:00:00Z")));return id;}
    void evaluation(UUID user,Instant at,String difficulty,String result,int overall){UUID c=UUID.randomUUID();jdbc.update("insert into conversations(id,user_id,scenario,language,title,created_at,updated_at) values(?,?,?,?,?,?,?)",c,user,"RESTAURANT","en","Practice",od(at),od(at));jdbc.update("insert into conversation_evaluations(id,conversation_id,difficulty,scenario,communication_score,grammar_score,vocabulary_score,fluency_score,relevance_score,overall_score,result,strengths,improvements,evaluated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),c,difficulty,"RESTAURANT",overall,overall,overall,overall,overall,overall,result,"[]","[]",od(at));}
    void activeConversation(UUID user){UUID c=UUID.randomUUID();jdbc.update("insert into conversations(id,user_id,scenario,language,title,created_at,updated_at,ended_at,response_in_progress,interaction_mode) values(?,?,?,?,?,?,?,?,?,?)",c,user,"RESTAURANT","en","Practice",od(now),od(now),null,false,"TEXT");}
    void reading(UUID user,Instant at,String difficulty,String status,Integer percentage){jdbc.update("insert into reading_activities(id,user_id,difficulty,topic,title,text,question_count,correct_answers,comprehension_percentage,status,created_at,completed_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),user,difficulty,"TRAVEL","A Travel Passage","A passage",3,percentage==null?null:percentage*3/100,percentage,status,od(at),od(at));}
    void endedConversation(UUID user,Instant endedAt){Instant created=endedAt.minusSeconds(60);UUID c=UUID.randomUUID();jdbc.update("insert into conversations(id,user_id,scenario,language,title,created_at,updated_at,ended_at,response_in_progress,interaction_mode) values(?,?,?,?,?,?,?,?,?,?)",c,user,"RESTAURANT","en","Practice",od(created),od(endedAt),od(endedAt),false,"TEXT");}
    void vocabularyLesson(UUID user,LocalDate date,boolean completed){UUID lesson=UUID.randomUUID();jdbc.update("insert into vocabulary_lessons(id,user_id,lesson_date,english_level,category,created_at,quiz_completed,quiz_score,writing_completed,completed_at) values(?,?,?,?,?,?,?,?,?,?)",lesson,user,date,"B1","GENERAL",od(now.minus(Duration.ofHours(1))),completed,completed?3:null,completed,completed?od(now):null);}
    void word(UUID user,Instant seen,String status,Instant review){String value="word-"+UUID.randomUUID();jdbc.update("insert into user_vocabulary_words(id,user_id,word,normalized_word,status,correct_count,incorrect_count,first_seen_at,last_seen_at,last_reviewed_at,next_review_at,review_stage,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),user,value,value,status,1,0,od(seen),od(seen),od(review),od(review),1,od(seen),od(seen));}
    @Test void aggregatesOnlyOwnedCompletedEvidenceAndPreservesNullAverages(){var a=user();var b=user();evaluation(a,now.minus(Duration.ofDays(2)),"INTERMEDIATE","SUCCESS",80);evaluation(b,now.minus(Duration.ofDays(2)),"INTERMEDIATE","NEEDS_PRACTICE",10);reading(a,now.minus(Duration.ofDays(1)),"BEGINNER","SUCCESS",100);reading(a,now.minus(Duration.ofDays(1)),"ADVANCED","IN_PROGRESS",null);word(a,now.minus(Duration.ofDays(1)),"MASTERED",now.minus(Duration.ofHours(1)));word(b,now.minus(Duration.ofDays(1)),"MASTERED",now.minus(Duration.ofHours(1)));var service=new ProgressService(queries,clock);var p=service.get(a,ProgressPeriod.LAST_7_DAYS);assertThat(p.conversation().totalEvaluated()).isEqualTo(1);assertThat(p.conversation().averageOverall()).isEqualTo(80);assertThat(p.conversation().averageRelevance()).isEqualTo(80);assertThat(p.reading().totalCompleted()).isEqualTo(1);assertThat(p.vocabulary().totalWords()).isEqualTo(1);assertThat(p.vocabulary().dueForReview()).isEqualTo(1);var empty=service.get(UUID.randomUUID(),ProgressPeriod.ALL_TIME);assertThat(empty.conversation().averageOverall()).isNull();assertThat(empty.conversation().averageRelevance()).isNull();}
    @Test void migratedReadingWithoutAnswersDoesNotBecomeACompletedResultOrDailyGoal(){
        var migrated=user();
        reading(migrated,now.minus(Duration.ofHours(2)),"BEGINNER","NEEDS_PRACTICE",null);
        var progress=new ProgressService(queries,clock).get(migrated,ProgressPeriod.ALL_TIME);
        assertThat(progress.reading().totalCompleted()).isZero();
        assertThat(progress.reading().needsPracticeCount()).isZero();
        assertThat(queries.readingByDifficulty(migrated,null,null).stream()
                .filter(row -> row.difficulty().equals("BEGINNER")).findFirst().orElseThrow().count()).isZero();
        assertThat(queries.dailyGoal(migrated,LocalDate.of(2026,9,16),
                Instant.parse("2026-09-16T00:00:00Z"),Instant.parse("2026-09-17T00:00:00Z")).readingCompleted()).isFalse();
        assertThat(new ProgressService(queries,clock).timeline(migrated).points().getLast().reading().count()).isZero();

        var completed=user();
        reading(completed,now.minus(Duration.ofHours(1)),"INTERMEDIATE","NEEDS_PRACTICE",33);
        assertThat(new ProgressService(queries,clock).get(completed,ProgressPeriod.ALL_TIME).reading().needsPracticeCount()).isEqualTo(1);
        assertThat(queries.dailyGoal(completed,LocalDate.of(2026,9,16),
                Instant.parse("2026-09-16T00:00:00Z"),Instant.parse("2026-09-17T00:00:00Z")).readingCompleted()).isTrue();
    }
    @Test void timelineContainsSixChronologicalMonthsIncludingGaps(){var a=user();evaluation(a,Instant.parse("2026-04-12T00:00:00Z"),"BEGINNER","SUCCESS",60);evaluation(a,Instant.parse("2026-09-02T00:00:00Z"),"ADVANCED","NEEDS_PRACTICE",40);var points=new ProgressService(queries,clock).timeline(a).points();assertThat(points).hasSize(6).extracting(ProgressService.TimelinePoint::period).containsExactly("2026-04","2026-05","2026-06","2026-07","2026-08","2026-09");assertThat(points.get(1).conversation().count()).isZero();assertThat(points.get(1).conversation().average()).isNull();assertThat(points.get(0).conversation().average()).isEqualTo(60);}
    @Test void currentMonthAndRollingThirtyDaysHaveDifferentWindows(){var a=user();evaluation(a,Instant.parse("2026-08-20T00:00:00Z"),"BEGINNER","SUCCESS",80);assertThat(new ProgressService(queries,clock).get(a,ProgressPeriod.CURRENT_MONTH).conversation().totalEvaluated()).isZero();assertThat(new ProgressService(queries,clock).get(a,ProgressPeriod.LAST_30_DAYS).conversation().totalEvaluated()).isEqualTo(1);}
    @Test void dailyGoalUsesCurrentUtcDayEachCategoryOnceAndOnlyOwnsCompletedEvidence(){
        var a=user();var b=user();var c=user();var d=user();
        vocabularyLesson(a,LocalDate.of(2026,9,16),true);
        vocabularyLesson(a,LocalDate.of(2026,9,15),true);
        endedConversation(a,now.minus(Duration.ofHours(2)));
        endedConversation(a,now.minus(Duration.ofHours(1)));
        reading(a,now.minus(Duration.ofHours(3)),"INTERMEDIATE","SUCCESS",100);
        reading(a,now.minus(Duration.ofHours(2)),"BEGINNER","NEEDS_PRACTICE",40);
        reading(a,now.minus(Duration.ofHours(1)),"ADVANCED","IN_PROGRESS",null);
        endedConversation(b,now.minus(Duration.ofHours(1)));
        reading(b,now.minus(Duration.ofHours(1)),"BEGINNER","SUCCESS",80);
        vocabularyLesson(c,LocalDate.of(2026,9,15),true);
        vocabularyLesson(c,LocalDate.of(2026,9,16),false);
        activeConversation(c);
        reading(c,now.minus(Duration.ofHours(1)),"BEGINNER","IN_PROGRESS",null);
        reading(d,now.minus(Duration.ofHours(1)),"BEGINNER","NEEDS_PRACTICE",40);
        var state=queries.dailyGoal(a,LocalDate.of(2026,9,16),Instant.parse("2026-09-16T00:00:00Z"),Instant.parse("2026-09-17T00:00:00Z"));
        assertThat(state.vocabularyCompleted()).isTrue();
        assertThat(state.conversationCompleted()).isTrue();
        assertThat(state.readingCompleted()).isTrue();
        assertThat(queries.dailyGoal(b,LocalDate.of(2026,9,16),Instant.parse("2026-09-16T00:00:00Z"),Instant.parse("2026-09-17T00:00:00Z")).readingCompleted()).isTrue();
        var incomplete=queries.dailyGoal(c,LocalDate.of(2026,9,16),Instant.parse("2026-09-16T00:00:00Z"),Instant.parse("2026-09-17T00:00:00Z"));
        assertThat(incomplete.vocabularyCompleted()).isFalse();
        assertThat(incomplete.conversationCompleted()).isFalse();
        assertThat(incomplete.readingCompleted()).isFalse();
        assertThat(queries.dailyGoal(d,LocalDate.of(2026,9,16),Instant.parse("2026-09-16T00:00:00Z"),Instant.parse("2026-09-17T00:00:00Z")).readingCompleted()).isTrue();
    }
    @Test void weeklyGoalsReturnsMondayThroughSundayWithCompleteAndIncompleteOwnedDays(){
        var a=user();var b=user();
        vocabularyLesson(a,LocalDate.of(2026,9,14),true);
        endedConversation(a,Instant.parse("2026-09-14T12:00:00Z"));
        reading(a,Instant.parse("2026-09-14T14:00:00Z"),"BEGINNER","SUCCESS",100);
        vocabularyLesson(a,LocalDate.of(2026,9,15),true);
        endedConversation(a,Instant.parse("2026-09-15T12:00:00Z"));
        reading(b,Instant.parse("2026-09-15T14:00:00Z"),"BEGINNER","SUCCESS",100);
        var rows=queries.weeklyGoals(a,LocalDate.of(2026,9,14),LocalDate.of(2026,9,20),Instant.parse("2026-09-14T00:00:00Z"),Instant.parse("2026-09-21T00:00:00Z"));
        assertThat(rows).hasSize(7).extracting(ProgressQueryRepository.DailyGoalRow::date).containsExactly(
                LocalDate.of(2026,9,14),LocalDate.of(2026,9,15),LocalDate.of(2026,9,16),LocalDate.of(2026,9,17),LocalDate.of(2026,9,18),LocalDate.of(2026,9,19),LocalDate.of(2026,9,20));
        assertThat(rows.get(0).vocabularyCompleted()).isTrue();
        assertThat(rows.get(0).conversationCompleted()).isTrue();
        assertThat(rows.get(0).readingCompleted()).isTrue();
        assertThat(rows.get(1).vocabularyCompleted()).isTrue();
        assertThat(rows.get(1).conversationCompleted()).isTrue();
        assertThat(rows.get(1).readingCompleted()).isFalse();
        assertThat(rows.subList(2,7)).allMatch(row -> !row.vocabularyCompleted() && !row.conversationCompleted() && !row.readingCompleted());
    }
}
