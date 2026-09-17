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
    void delete(UUID id){jdbc.update("delete from reading_activities where user_id=?",id);jdbc.update("delete from user_vocabulary_words where user_id=?",id);jdbc.update("delete from conversations where user_id=?",id);jdbc.update("delete from users where id=?",id);}
    OffsetDateTime od(Instant instant){return instant.atOffset(ZoneOffset.UTC);}
    UUID user(){UUID id=UUID.randomUUID();owners.add(id);users.saveAndFlush(new UserEntity(id,"progress-"+id+"@test.com","progress"+id.toString().replace("-",""),"hash",OffsetDateTime.parse("2026-09-01T00:00:00Z"),OffsetDateTime.parse("2026-09-01T00:00:00Z")));return id;}
    void evaluation(UUID user,Instant at,String difficulty,String result,int overall){UUID c=UUID.randomUUID();jdbc.update("insert into conversations(id,user_id,scenario,language,title,created_at,updated_at) values(?,?,?,?,?,?,?)",c,user,"RESTAURANT","en","Practice",od(at),od(at));jdbc.update("insert into conversation_evaluations(id,conversation_id,difficulty,scenario,communication_score,grammar_score,vocabulary_score,fluency_score,overall_score,result,strengths,improvements,evaluated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),c,difficulty,"RESTAURANT",overall,overall,overall,overall,overall,result,"[]","[]",od(at));}
    void reading(UUID user,Instant at,String difficulty,String status,Integer percentage){jdbc.update("insert into reading_activities(id,user_id,difficulty,topic,text,question_count,correct_answers,comprehension_percentage,status,created_at,completed_at) values(?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),user,difficulty,"TRAVEL","A passage",3,percentage==null?null:percentage*3/100,percentage,status,od(at),od(at));}
    void word(UUID user,Instant seen,String status,Instant review){String value="word-"+UUID.randomUUID();jdbc.update("insert into user_vocabulary_words(id,user_id,word,normalized_word,status,correct_count,incorrect_count,first_seen_at,last_seen_at,last_reviewed_at,next_review_at,review_stage,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",UUID.randomUUID(),user,value,value,status,1,0,od(seen),od(seen),od(review),od(review),1,od(seen),od(seen));}
    @Test void aggregatesOnlyOwnedCompletedEvidenceAndPreservesNullAverages(){var a=user();var b=user();evaluation(a,now.minus(Duration.ofDays(2)),"INTERMEDIATE","SUCCESS",80);evaluation(b,now.minus(Duration.ofDays(2)),"INTERMEDIATE","NEEDS_PRACTICE",10);reading(a,now.minus(Duration.ofDays(1)),"BEGINNER","SUCCESS",100);reading(a,now.minus(Duration.ofDays(1)),"ADVANCED","IN_PROGRESS",null);word(a,now.minus(Duration.ofDays(1)),"MASTERED",now.minus(Duration.ofHours(1)));word(b,now.minus(Duration.ofDays(1)),"MASTERED",now.minus(Duration.ofHours(1)));var service=new ProgressService(queries,clock);var p=service.get(a,ProgressPeriod.LAST_7_DAYS);assertThat(p.conversation().totalEvaluated()).isEqualTo(1);assertThat(p.conversation().averageOverall()).isEqualTo(80);assertThat(p.reading().totalCompleted()).isEqualTo(1);assertThat(p.vocabulary().totalWords()).isEqualTo(1);assertThat(p.vocabulary().dueForReview()).isEqualTo(1);var empty=service.get(UUID.randomUUID(),ProgressPeriod.ALL_TIME);assertThat(empty.conversation().averageOverall()).isNull();}
    @Test void timelineContainsSixChronologicalMonthsIncludingGaps(){var a=user();evaluation(a,Instant.parse("2026-04-12T00:00:00Z"),"BEGINNER","SUCCESS",60);evaluation(a,Instant.parse("2026-09-02T00:00:00Z"),"ADVANCED","NEEDS_PRACTICE",40);var points=new ProgressService(queries,clock).timeline(a).points();assertThat(points).hasSize(6).extracting(ProgressService.TimelinePoint::period).containsExactly("2026-04","2026-05","2026-06","2026-07","2026-08","2026-09");assertThat(points.get(1).conversation().count()).isZero();assertThat(points.get(1).conversation().average()).isNull();assertThat(points.get(0).conversation().average()).isEqualTo(60);}
    @Test void currentMonthAndRollingThirtyDaysHaveDifferentWindows(){var a=user();evaluation(a,Instant.parse("2026-08-20T00:00:00Z"),"BEGINNER","SUCCESS",80);assertThat(new ProgressService(queries,clock).get(a,ProgressPeriod.CURRENT_MONTH).conversation().totalEvaluated()).isZero();assertThat(new ProgressService(queries,clock).get(a,ProgressPeriod.LAST_30_DAYS).conversation().totalEvaluated()).isEqualTo(1);}
}
