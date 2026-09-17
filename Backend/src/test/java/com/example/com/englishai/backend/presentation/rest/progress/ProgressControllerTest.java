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
            .andExpect(status().isOk()).andExpect(jsonPath("$.period").value("ALL_TIME"));
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
    private ProgressService.ProgressResponse empty(ProgressPeriod period){return new ProgressService.ProgressResponse(period,null,Instant.parse("2026-09-16T12:00:00Z"),new ProgressService.Overview(0,0,0,0),new ProgressService.ConversationProgress(0,0,0,null,null,null,null,null,null,List.of()),new ProgressService.ReadingProgress(0,0,0,null,null,List.of()),new ProgressService.VocabularyProgress(0,0,0,0,0,0,0,0),null);}
}
