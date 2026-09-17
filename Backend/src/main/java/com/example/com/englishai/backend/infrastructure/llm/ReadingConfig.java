package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.reading.ReadingService;
import com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingActivityJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.ReadingQuestionJpaRepository;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ReadingConfig {
    @Bean
    public ReadingService readingService(LlmProvider provider, ReadingActivityJpaRepository activities,
                                        ReadingQuestionJpaRepository questions) {
        return new ReadingService(provider, activities, questions, Clock.systemUTC());
    }
}
