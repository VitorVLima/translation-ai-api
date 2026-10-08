package com.example.com.englishai.backend.application.progress;

import com.example.com.englishai.backend.application.conversation.ConversationDifficulty;
import com.example.com.englishai.backend.application.vocabulary.VocabularyService.ProgressStatus;
import com.example.com.englishai.backend.infrastructure.persistence.repository.ProgressQueryRepository;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

@Service
public class ProgressService {
    public static final ZoneId DEFAULT_ZONE = ZoneOffset.UTC;
    private final ProgressQueryRepository queries;
    private final Clock clock;
    @Autowired
    public ProgressService(ProgressQueryRepository queries) { this(queries, Clock.systemUTC()); }
    public ProgressService(ProgressQueryRepository queries, Clock clock) { this.queries=queries; this.clock=clock; }

    public ProgressResponse get(UUID userId, ProgressPeriod period) {
        ProgressPeriod selected = period == null ? ProgressPeriod.ALL_TIME : period;
        var b=selected.bounds(clock, DEFAULT_ZONE); Instant now=clock.instant();
        var conversation = sectionConversations(userId,b);
        var reading = sectionReading(userId,b);
        var vocabulary = vocabulary(userId,b,now);
        var weeklyGoals = weeklyGoals(userId, now);
        var dailyGoal = weeklyGoals.days().stream()
                .filter(day -> day.date().equals(now.atZone(DEFAULT_ZONE).toLocalDate()))
                .findFirst()
                .orElseGet(() -> emptyDailyGoal(now.atZone(DEFAULT_ZONE).toLocalDate()));
        var overview = new Overview(conversation.totalEvaluated(), reading.totalCompleted(), vocabulary.wordsFirstSeenInPeriod(), vocabulary.masteredCount());
        var comparison = selected == ProgressPeriod.ALL_TIME ? null : comparison(userId,b);
        return new ProgressResponse(selected,b.start(),now,overview,conversation,reading,vocabulary,comparison,dailyGoal,weeklyGoals);
    }

    public TimelineResponse timeline(UUID userId) {
        ZonedDateTime current=clock.instant().atZone(DEFAULT_ZONE).withDayOfMonth(1);
        List<TimelinePoint> points=new ArrayList<>();
        for(int i=5;i>=0;i--) {
            YearMonth month=YearMonth.from(current).minusMonths(i);
            Instant start=month.atDay(1).atStartOfDay(DEFAULT_ZONE).toInstant();
            Instant end=month.plusMonths(1).atDay(1).atStartOfDay(DEFAULT_ZONE).toInstant();
            var row=queries.timeline(userId,start,end);
            points.add(new TimelinePoint(month.toString(),new TimelineMetric(row.conversationCount(),row.averageConversation()),new TimelineMetric(row.readingCount(),row.averageReading()),new TimelineVocabulary(row.wordsFirstSeen())));
        }
        return new TimelineResponse(points);
    }

    private ConversationProgress sectionConversations(UUID id, ProgressPeriod.Bounds b) {
        var total=queries.conversations(id,b.start(),b.end());
        return new ConversationProgress(total.total(),total.success(),total.needsPractice(),rate(total.success(),total.total()),total.avgOverall(),total.avgCommunication(),total.avgGrammar(),total.avgVocabulary(),total.avgFluency(),total.avgRelevance(),queries.conversationsByDifficulty(id,b.start(),b.end()));
    }
    private ReadingProgress sectionReading(UUID id, ProgressPeriod.Bounds b) {
        var total=queries.reading(id,b.start(),b.end());
        return new ReadingProgress(total.total(),total.success(),total.needsPractice(),rate(total.success(),total.total()),total.average(),queries.readingByDifficulty(id,b.start(),b.end()));
    }
    private VocabularyProgress vocabulary(UUID id, ProgressPeriod.Bounds b, Instant now) {
        var state=queries.vocabularyState(id,now,b.start(),b.end());
        long total = state.newCount() + state.reviewingCount() + state.learnedCount() + state.masteredCount();
        return new VocabularyProgress(total,state.newCount(),state.reviewingCount(),state.learnedCount(),state.masteredCount(),state.due(),state.firstSeen(),state.reviewed());
    }
    private WeeklyGoals weeklyGoals(UUID id, Instant now) {
        LocalDate date = now.atZone(DEFAULT_ZONE).toLocalDate();
        LocalDate weekStart = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate weekEnd = weekStart.plusDays(6);
        Instant start = weekStart.atStartOfDay(DEFAULT_ZONE).toInstant();
        Instant end = weekEnd.plusDays(1).atStartOfDay(DEFAULT_ZONE).toInstant();
        Map<LocalDate, ProgressQueryRepository.DailyGoalRow> states = new HashMap<>();
        for (var row : queries.weeklyGoals(id, weekStart, weekEnd, start, end)) states.put(row.date(), row);
        List<DailyGoal> days = new ArrayList<>();
        for (int index = 0; index < 7; index++) {
            LocalDate day = weekStart.plusDays(index);
            var state = states.get(day);
            days.add(dailyGoal(day,
                    state != null && state.vocabularyCompleted(),
                    state != null && state.conversationCompleted(),
                    state != null && state.readingCompleted()));
        }
        int completedDays = (int) days.stream().filter(DailyGoal::goalCompleted).count();
        return new WeeklyGoals(weekStart, weekEnd, completedDays, 7, days);
    }
    private DailyGoal dailyGoal(LocalDate date, boolean vocabulary, boolean conversation, boolean reading) {
        int completed = (vocabulary ? 1 : 0) + (conversation ? 1 : 0) + (reading ? 1 : 0);
        return new DailyGoal(date, completed, 3,
                new DailyGoalItem(vocabulary), new DailyGoalItem(conversation),
                new DailyGoalItem(reading), completed == 3);
    }
    private DailyGoal emptyDailyGoal(LocalDate date) { return dailyGoal(date, false, false, false); }
    private Comparison comparison(UUID id, ProgressPeriod.Bounds b) {
        var current=queries.conversations(id,b.start(),b.end()); var previous=queries.conversations(id,b.previousStart(),b.previousEnd());
        var cr=queries.reading(id,b.start(),b.end()); var pr=queries.reading(id,b.previousStart(),b.previousEnd());
        return new Comparison(metric(current.avgOverall(),previous.avgOverall()),metric(cr.average(),pr.average()),metric((double)current.total(),(double)previous.total()),metric((double)cr.total(),(double)pr.total()),metric((double)queries.vocabularyFirstSeen(id,b.start(),b.end()),(double)queries.vocabularyFirstSeen(id,b.previousStart(),b.previousEnd())));
    }
    private Metric metric(Double current, Double previous) { return new Metric(current,previous,current==null||previous==null?null:Math.round(current-previous)); }
    private Integer rate(long success,long total) { return total==0?null:(int)Math.round(success*100.0/total); }

    public record ProgressResponse(ProgressPeriod period, Instant periodStart, Instant periodEnd, Overview overview, ConversationProgress conversation, ReadingProgress reading, VocabularyProgress vocabulary, Comparison comparison, DailyGoal dailyGoal, WeeklyGoals weeklyGoals) {}
    public record Overview(long conversationsCompleted,long readingsCompleted,long wordsFirstSeen,long wordsMasteredCurrent) {}
    public record ConversationProgress(long totalEvaluated,long successCount,long needsPracticeCount,Integer successRate,Double averageOverall,Double averageCommunication,Double averageGrammar,Double averageVocabulary,Double averageFluency,Double averageRelevance,List<ProgressQueryRepository.DifficultyRow> byDifficulty) {}
    public record ReadingProgress(long totalCompleted,long successCount,long needsPracticeCount,Integer successRate,Double averageComprehension,List<ProgressQueryRepository.ReadingDifficultyRow> byDifficulty) {}
    public record VocabularyProgress(long totalWords,long newCount,long reviewingCount,long learnedCount,long masteredCount,long dueForReview,long wordsFirstSeenInPeriod,long wordsReviewedInPeriod) {}
    public record Metric(Double current,Double previous,Long delta) {}
    public record Comparison(Metric conversationAverageOverall,Metric readingAverageComprehension,Metric conversationCount,Metric readingCount,Metric newWordsCount) {}
    public record DailyGoal(LocalDate date, int completed, int total, DailyGoalItem vocabulary, DailyGoalItem conversation, DailyGoalItem reading, boolean goalCompleted) {}
    public record DailyGoalItem(boolean completed) {}
    public record WeeklyGoals(LocalDate weekStart, LocalDate weekEnd, int completedDays, int totalDays, List<DailyGoal> days) { public WeeklyGoals { days=List.copyOf(days); } }
    public record TimelineResponse(List<TimelinePoint> points) { public TimelineResponse { points=List.copyOf(points); } }
    public record TimelinePoint(String period,TimelineMetric conversation,TimelineMetric reading,TimelineVocabulary vocabulary) {}
    public record TimelineMetric(long count,Double average) {}
    public record TimelineVocabulary(long wordsFirstSeen) {}
}
