package com.example.com.englishai.backend.infrastructure.persistence.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.*;

@Repository
public class ProgressQueryRepository {
    private final JdbcTemplate jdbc;
    public ProgressQueryRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private String range(String column, Instant start, Instant end) { return start==null?"": " AND "+column+" >= ? AND "+column+" < ?"; }
    private Object dbTime(Instant value) { return value == null ? null : OffsetDateTime.ofInstant(value, ZoneOffset.UTC); }
    private List<Object> args(UUID id, Instant start, Instant end) { var a=new ArrayList<Object>();a.add(id);if(start!=null){a.add(dbTime(start));a.add(dbTime(end));}return a; }
    public Aggregate conversations(UUID id, Instant start, Instant end) {
        String sql="SELECT count(*) total, count(*) FILTER (WHERE result='SUCCESS') success, count(*) FILTER (WHERE result='NEEDS_PRACTICE') needs, avg(overall_score) overall, avg(communication_score) communication, avg(grammar_score) grammar, avg(vocabulary_score) vocabulary, avg(fluency_score) fluency FROM conversation_evaluations WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id=?)"+range("evaluated_at",start,end);
        return jdbc.queryForObject(sql,args(id,start,end).toArray(),(r,n)->new Aggregate(r.getLong("total"),r.getLong("success"),r.getLong("needs"),number(r,"overall"),number(r,"communication"),number(r,"grammar"),number(r,"vocabulary"),number(r,"fluency"),null));
    }
    public List<DifficultyRow> conversationsByDifficulty(UUID id, Instant start, Instant end) {
        String sql="SELECT d.difficulty, count(e.conversation_id) count, count(e.conversation_id) FILTER (WHERE e.result='SUCCESS') success, avg(e.overall_score) overall, avg(e.communication_score) communication, avg(e.grammar_score) grammar, avg(e.vocabulary_score) vocabulary, avg(e.fluency_score) fluency FROM (VALUES ('BEGINNER'),('INTERMEDIATE'),('ADVANCED')) d(difficulty) LEFT JOIN conversation_evaluations e ON e.difficulty=d.difficulty AND e.conversation_id IN (SELECT id FROM conversations WHERE user_id=?)"+range("e.evaluated_at",start,end)+" GROUP BY d.difficulty ORDER BY d.difficulty";
        return jdbc.query(sql,args(id,start,end).toArray(),(r,n)->new DifficultyRow(r.getString("difficulty"),r.getLong("count"),r.getLong("success"),number(r,"overall"),number(r,"communication"),number(r,"grammar"),number(r,"vocabulary"),number(r,"fluency")));
    }
    public Aggregate reading(UUID id, Instant start, Instant end) {
        String sql="SELECT count(*) total, count(*) FILTER (WHERE status='SUCCESS') success, count(*) FILTER (WHERE status='NEEDS_PRACTICE') needs, avg(comprehension_percentage) average FROM reading_activities WHERE user_id=? AND status IN ('SUCCESS','NEEDS_PRACTICE')"+range("completed_at",start,end);
        return jdbc.queryForObject(sql,args(id,start,end).toArray(),(r,n)->new Aggregate(r.getLong("total"),r.getLong("success"),r.getLong("needs"),null,null,null,null,null,number(r,"average")));
    }
    public List<ReadingDifficultyRow> readingByDifficulty(UUID id, Instant start, Instant end) {
        String sql="SELECT d.difficulty,count(a.id) count,count(a.id) FILTER(WHERE a.status='SUCCESS') success,avg(a.comprehension_percentage) average FROM (VALUES ('BEGINNER'),('INTERMEDIATE'),('ADVANCED')) d(difficulty) LEFT JOIN reading_activities a ON a.difficulty=d.difficulty AND a.user_id=? AND a.status IN ('SUCCESS','NEEDS_PRACTICE')"+range("a.completed_at",start,end)+" GROUP BY d.difficulty ORDER BY d.difficulty";
        return jdbc.query(sql,args(id,start,end).toArray(),(r,n)->new ReadingDifficultyRow(r.getString("difficulty"),r.getLong("count"),r.getLong("success"),number(r,"average")));
    }
    public VocabularyState vocabularyState(UUID id, Instant now, Instant start, Instant end) {
        String reviewed = start == null ? "0" : "count(*) FILTER(WHERE last_reviewed_at>=? AND last_reviewed_at<?)";
        String first = start == null ? "count(*)" : "count(*) FILTER(WHERE first_seen_at>=? AND first_seen_at<?)";
        String sql="SELECT count(*) total,count(*) FILTER(WHERE status='NEW') new_count,count(*) FILTER(WHERE status='LEARNING') learning_count,count(*) FILTER(WHERE status='REVIEWING') reviewing_count,count(*) FILTER(WHERE status='MASTERED') mastered_count,count(*) FILTER(WHERE next_review_at IS NOT NULL AND next_review_at<=?) due,"+first+" first_seen,"+reviewed+" reviewed FROM user_vocabulary_words WHERE user_id=?";
        Object[] a = start == null ? new Object[]{dbTime(now),id} : new Object[]{dbTime(now),dbTime(start),dbTime(end),dbTime(start),dbTime(end),id};
        return jdbc.queryForObject(sql,a,(r,n)->new VocabularyState(r.getLong("total"),r.getLong("new_count"),r.getLong("learning_count"),r.getLong("reviewing_count"),r.getLong("mastered_count"),r.getLong("due"),r.getLong("first_seen"),r.getLong("reviewed")));
    }
    public long vocabularyFirstSeen(UUID id,Instant start,Instant end){return jdbc.queryForObject("SELECT count(*) FROM user_vocabulary_words WHERE user_id=?"+range("first_seen_at",start,end),args(id,start,end).toArray(),Long.class);}
    public TimelineRow timeline(UUID id,Instant start,Instant end){String sql="SELECT (SELECT count(*) FROM conversation_evaluations e JOIN conversations c ON c.id=e.conversation_id WHERE c.user_id=? AND e.evaluated_at>=? AND e.evaluated_at<?) conversation_count,(SELECT avg(e.overall_score) FROM conversation_evaluations e JOIN conversations c ON c.id=e.conversation_id WHERE c.user_id=? AND e.evaluated_at>=? AND e.evaluated_at<?) conversation_average,(SELECT count(*) FROM reading_activities WHERE user_id=? AND status IN ('SUCCESS','NEEDS_PRACTICE') AND completed_at>=? AND completed_at<?) reading_count,(SELECT avg(comprehension_percentage) FROM reading_activities WHERE user_id=? AND status IN ('SUCCESS','NEEDS_PRACTICE') AND completed_at>=? AND completed_at<?) reading_average,(SELECT count(*) FROM user_vocabulary_words WHERE user_id=? AND first_seen_at>=? AND first_seen_at<?) words_first_seen"; Object t=dbTime(start),u=dbTime(end); Object[] a={id,t,u,id,t,u,id,t,u,id,t,u,id,t,u};return jdbc.queryForObject(sql,a,(r,n)->new TimelineRow(r.getLong("conversation_count"),number(r,"conversation_average"),r.getLong("reading_count"),number(r,"reading_average"),r.getLong("words_first_seen")));}
    private Double number(java.sql.ResultSet r,String c){try{Object v=r.getObject(c);return v==null?null:((Number)v).doubleValue();}catch(java.sql.SQLException e){throw new IllegalStateException(e);}}
    public record Aggregate(long total,long success,long needsPractice,Double avgOverall,Double avgCommunication,Double avgGrammar,Double avgVocabulary,Double avgFluency,Double average){ }
    public record DifficultyRow(String difficulty,long count,long successCount,Double averageOverall,Double averageCommunication,Double averageGrammar,Double averageVocabulary,Double averageFluency) {}
    public record ReadingDifficultyRow(String difficulty,long count,long successCount,Double averageComprehension) {}
    public record VocabularyState(long total,long newCount,long learningCount,long reviewingCount,long masteredCount,long due,long firstSeen,long reviewed) {}
    public record TimelineRow(long conversationCount,Double averageConversation,long readingCount,Double averageReading,long wordsFirstSeen) {}
}
