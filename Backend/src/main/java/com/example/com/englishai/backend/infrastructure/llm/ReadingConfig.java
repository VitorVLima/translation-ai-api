package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.reading.ReadingService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ReadingConfig {
    @Bean
    public ReadingService readingService(LlmProvider provider) { return new ReadingService(provider); }
}
