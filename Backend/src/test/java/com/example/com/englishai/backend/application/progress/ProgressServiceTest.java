package com.example.com.englishai.backend.application.progress;

import com.example.com.englishai.backend.infrastructure.persistence.repository.ProgressQueryRepository;
import org.junit.jupiter.api.*;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProgressServiceTest {
    final ProgressQueryRepository queries=mock(ProgressQueryRepository.class);
    final Clock clock=Clock.fixed(Instant.parse("2026-09-16T12:00:00Z"),ZoneOffset.UTC);
    final ProgressService service=new ProgressService(queries,clock);
    final UUID user=UUID.randomUUID();
    ProgressQueryRepository.Aggregate conversations(long total,long success,Double avg){return new ProgressQueryRepository.Aggregate(total,success,total-success,avg,80d,70d,75d,avg,74d,null);}
    ProgressQueryRepository.Aggregate readings(long total,long success,Double avg){return new ProgressQueryRepository.Aggregate(total,success,total-success,null,null,null,null,null,null,avg);}
    List<ProgressQueryRepository.DailyGoalRow> week(boolean vocabulary,boolean conversation,boolean reading){
        LocalDate start=LocalDate.of(2026,9,14);List<ProgressQueryRepository.DailyGoalRow> rows=new ArrayList<>();
        for(int i=0;i<7;i++){LocalDate date=start.plusDays(i);boolean current=date.equals(LocalDate.of(2026,9,16));rows.add(new ProgressQueryRepository.DailyGoalRow(date,current&&vocabulary,current&&conversation,current&&reading));}
        return rows;
    }
    @BeforeEach void setup(){
        when(queries.conversations(eq(user),any(),any())).thenReturn(conversations(2,1,76d));
        when(queries.reading(eq(user),any(),any())).thenReturn(readings(3,2,67d));
        when(queries.conversationsByDifficulty(eq(user),any(),any())).thenReturn(List.of(new ProgressQueryRepository.DifficultyRow("BEGINNER",0,0,null,null,null,null,null,null),new ProgressQueryRepository.DifficultyRow("INTERMEDIATE",2,1,76d,80d,70d,75d,76d,74d),new ProgressQueryRepository.DifficultyRow("ADVANCED",0,0,null,null,null,null,null,null)));
        when(queries.readingByDifficulty(eq(user),any(),any())).thenReturn(List.of(new ProgressQueryRepository.ReadingDifficultyRow("BEGINNER",0,0,null),new ProgressQueryRepository.ReadingDifficultyRow("INTERMEDIATE",3,2,67d),new ProgressQueryRepository.ReadingDifficultyRow("ADVANCED",0,0,null)));
        when(queries.vocabularyState(eq(user),any(),any(),any())).thenReturn(new ProgressQueryRepository.VocabularyState(10,2,3,4,1,2,3,1));
        when(queries.vocabularyFirstSeen(eq(user),any(),any())).thenReturn(3L);
        when(queries.timeline(eq(user),any(),any())).thenReturn(new ProgressQueryRepository.TimelineRow(1,76d,2,67d,3));
        when(queries.weeklyGoals(eq(user),any(),any(),any(),any())).thenReturn(week(false,false,false));
    }
    @Test void allTimeDefaultsAndAggregatesWithoutMutation(){
        var result=service.get(user,null);
        assertThat(result.period()).isEqualTo(ProgressPeriod.ALL_TIME);
        assertThat(result.overview().conversationsCompleted()).isEqualTo(2);
        assertThat(result.conversation().successRate()).isEqualTo(50);
        assertThat(result.conversation().averageRelevance()).isEqualTo(74);
        assertThat(result.reading().successRate()).isEqualTo(67);
        assertThat(result.vocabulary().masteredCount()).isEqualTo(1);
        assertThat(result.comparison()).isNull();
        verify(queries,never()).timeline(any(),any(),any());
    }
    @Test void finitePeriodHasPreviousComparisonAndDoesNotTurnMissingAveragesIntoZero(){
        when(queries.conversations(eq(user),any(),any())).thenAnswer(i -> ((Instant)i.getArgument(1)).equals(Instant.parse("2026-09-09T12:00:00Z")) ? conversations(2,1,76d) : conversations(0,0,null));
        var result=service.get(user,ProgressPeriod.LAST_7_DAYS);
        assertThat(result.periodStart()).isEqualTo(Instant.parse("2026-09-09T12:00:00Z"));
        assertThat(result.comparison().conversationAverageOverall().previous()).isNull();
        assertThat(result.comparison().conversationAverageOverall().delta()).isNull();
    }
    @Test void currentMonthUsesCalendarPreviousMonthAndTimelineAlwaysHasSixPoints(){
        var result=service.get(user,ProgressPeriod.CURRENT_MONTH);
        assertThat(result.periodStart()).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(result.periodEnd()).isEqualTo(clock.instant());
        var timeline=service.timeline(user);
        assertThat(timeline.points()).hasSize(6).extracting(ProgressService.TimelinePoint::period).containsExactly("2026-04","2026-05","2026-06","2026-07","2026-08","2026-09");
    }
    @Test void periodBoundariesDistinguishMonthAndRollingThirtyDays(){
        var month=ProgressPeriod.CURRENT_MONTH.bounds(clock,ZoneOffset.UTC);var rolling=ProgressPeriod.LAST_30_DAYS.bounds(clock,ZoneOffset.UTC);
        assertThat(month.start()).isEqualTo(Instant.parse("2026-09-01T00:00:00Z"));
        assertThat(rolling.start()).isEqualTo(Instant.parse("2026-08-17T12:00:00Z"));
        assertThat(month.previousStart()).isEqualTo(Instant.parse("2026-08-01T00:00:00Z"));
    }
    @Test void zeroDataKeepsAveragesNull(){
        when(queries.conversations(eq(user),any(),any())).thenReturn(conversations(0,0,null));when(queries.reading(eq(user),any(),any())).thenReturn(readings(0,0,null));
        var r=service.get(user,ProgressPeriod.ALL_TIME);assertThat(r.conversation().averageOverall()).isNull();assertThat(r.reading().averageComprehension()).isNull();
    }
    @Test void calendarComparisonCapsPreviousMonthWhenCurrentDayDoesNotExist(){
        Clock febClock=Clock.fixed(Instant.parse("2024-02-29T12:00:00Z"),ZoneOffset.UTC);
        var bounds=ProgressPeriod.CURRENT_MONTH.bounds(febClock,ZoneOffset.UTC);
        assertThat(bounds.previousStart()).isEqualTo(Instant.parse("2024-01-01T00:00:00Z"));
        assertThat(bounds.previousEnd()).isEqualTo(Instant.parse("2024-01-30T00:00:00Z"));
    }
    @Test void dailyGoalCountsEachCategoryOnceAndUsesUtcDay(){
        when(queries.weeklyGoals(eq(user),any(),any(),any(),any())).thenReturn(week(true,true,true));
        var response=service.get(user,ProgressPeriod.ALL_TIME);var result=response.dailyGoal();
        assertThat(result.date()).isEqualTo(LocalDate.of(2026,9,16));
        assertThat(result.completed()).isEqualTo(3);
        assertThat(result.total()).isEqualTo(3);
        assertThat(result.goalCompleted()).isTrue();
        assertThat(response.weeklyGoals().weekStart()).isEqualTo(LocalDate.of(2026,9,14));
        assertThat(response.weeklyGoals().weekEnd()).isEqualTo(LocalDate.of(2026,9,20));
        assertThat(response.weeklyGoals().days()).hasSize(7);
        assertThat(response.weeklyGoals().completedDays()).isEqualTo(1);
        verify(queries).weeklyGoals(user,LocalDate.of(2026,9,14),LocalDate.of(2026,9,20),Instant.parse("2026-09-14T00:00:00Z"),Instant.parse("2026-09-21T00:00:00Z"));
    }
    @Test void dailyGoalMapsPartialCategoriesWithoutPerformanceScores(){
        when(queries.weeklyGoals(eq(user),any(),any(),any(),any())).thenReturn(week(true,false,true));
        var result=service.get(user,ProgressPeriod.ALL_TIME).dailyGoal();
        assertThat(result.completed()).isEqualTo(2);
        assertThat(result.vocabulary().completed()).isTrue();
        assertThat(result.conversation().completed()).isFalse();
        assertThat(result.reading().completed()).isTrue();
        assertThat(result.goalCompleted()).isFalse();
    }
    @Test void dailyGoalSupportsZeroAndOnePointForEachCategory(){
        var states=List.of(
                week(false,false,false),week(true,false,false),week(false,true,false),week(false,false,true));
        when(queries.weeklyGoals(eq(user),any(),any(),any(),any())).thenReturn(states.get(0),states.get(1),states.get(2),states.get(3));
        for(int i=0;i<states.size();i++) assertThat(service.get(user,ProgressPeriod.ALL_TIME).dailyGoal().completed()).isEqualTo(i==0?0:1);
    }
}
