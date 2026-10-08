package com.example.com.englishai.backend.presentation.rest.progress;

import com.example.com.englishai.backend.application.ports.AuthenticationTokenValidator;
import com.example.com.englishai.backend.application.progress.*;
import com.example.com.englishai.backend.infrastructure.security.SecurityConfig;
import com.example.com.englishai.backend.presentation.rest.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProgressController.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class})
class ProgressControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ProgressService service;
    @MockitoBean AuthenticationTokenValidator tokens;
    final UUID user=UUID.randomUUID();
    @BeforeEach void auth(){when(tokens.validateAndGetUserId("test")).thenReturn(user);}
    @Test void requiresAuthentication() throws Exception {assertThat(mvc.perform(get("/api/v1/progress")).andReturn().getResponse().getStatus()).isEqualTo(401);}
    @Test void defaultsToAllTimeAndUsesPrincipal() throws Exception {
        when(service.get(user,ProgressPeriod.ALL_TIME)).thenReturn(empty());
        mvc.perform(get("/api/v1/progress").header("Authorization","Bearer test"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.period").value("ALL_TIME"))
            .andExpect(jsonPath("$.vocabulary.totalWords").value(0))
            .andExpect(jsonPath("$.vocabulary.newCount").value(0))
            .andExpect(jsonPath("$.vocabulary.reviewingCount").value(0))
            .andExpect(jsonPath("$.vocabulary.learnedCount").value(0))
            .andExpect(jsonPath("$.vocabulary.masteredCount").value(0))
            .andExpect(jsonPath("$.vocabulary.learningCount").doesNotExist())
            .andExpect(jsonPath("$.dailyGoal.completed").value(0))
            .andExpect(jsonPath("$.dailyGoal.total").value(3))
            .andExpect(jsonPath("$.dailyGoal.goalCompleted").value(false))
            .andExpect(jsonPath("$.weeklyGoals.weekStart").value("2026-09-14"))
            .andExpect(jsonPath("$.weeklyGoals.weekEnd").value("2026-09-20"))
            .andExpect(jsonPath("$.weeklyGoals.completedDays").value(0))
            .andExpect(jsonPath("$.weeklyGoals.totalDays").value(7))
            .andExpect(jsonPath("$.weeklyGoals.days.length()").value(7));
        verify(service).get(user,ProgressPeriod.ALL_TIME);
    }
    @Test void acceptsPeriodAndTimeline() throws Exception {
        when(service.get(user,ProgressPeriod.CURRENT_MONTH)).thenReturn(empty(ProgressPeriod.CURRENT_MONTH)); when(service.timeline(user)).thenReturn(new ProgressService.TimelineResponse(List.of()));
        mvc.perform(get("/api/v1/progress?period=CURRENT_MONTH").header("Authorization","Bearer test")).andExpect(status().isOk()).andExpect(jsonPath("$.period").value("CURRENT_MONTH"));
        mvc.perform(get("/api/v1/progress/timeline").header("Authorization","Bearer test")).andExpect(status().isOk()).andExpect(jsonPath("$.points").isArray());
        verify(service).get(user,ProgressPeriod.CURRENT_MONTH);verify(service).timeline(user);
    }
    @Test void invalidPeriodIsBadRequest() throws Exception {assertThat(mvc.perform(get("/api/v1/progress?period=UNKNOWN").header("Authorization","Bearer test")).andReturn().getResponse().getStatus()).isEqualTo(400);verifyNoInteractions(service);}
    private ProgressService.ProgressResponse empty(){return empty(ProgressPeriod.ALL_TIME);}
    private ProgressService.ProgressResponse empty(ProgressPeriod period){
        var emptyDay=new ProgressService.DailyGoal(java.time.LocalDate.of(2026,9,16),0,3,new ProgressService.DailyGoalItem(false),new ProgressService.DailyGoalItem(false),new ProgressService.DailyGoalItem(false),false);
        var days=java.util.stream.IntStream.range(0,7).mapToObj(index->new ProgressService.DailyGoal(java.time.LocalDate.of(2026,9,14).plusDays(index),0,3,new ProgressService.DailyGoalItem(false),new ProgressService.DailyGoalItem(false),new ProgressService.DailyGoalItem(false),false)).toList();
        return new ProgressService.ProgressResponse(period,null,Instant.parse("2026-09-16T12:00:00Z"),new ProgressService.Overview(0,0,0,0),new ProgressService.ConversationProgress(0,0,0,null,null,null,null,null,null,null,List.of()),new ProgressService.ReadingProgress(0,0,0,null,null,List.of()),new ProgressService.VocabularyProgress(0,0,0,0,0,0,0,0),null,emptyDay,new ProgressService.WeeklyGoals(java.time.LocalDate.of(2026,9,14),java.time.LocalDate.of(2026,9,20),0,7,days));
    }
}
