package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.vocabulary.VocabularyService;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserProfileJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserVocabularyWordJpaRepository;
import com.example.com.englishai.backend.infrastructure.persistence.repository.VocabularyLessonJpaRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class VocabularyConfig {
    @Bean
    public VocabularyService vocabularyService(LlmProvider provider,
                                               UserProfileJpaRepository profiles,
                                               VocabularyLessonJpaRepository lessons,
                                               UserVocabularyWordJpaRepository vocabularyWords,
                                               UserJpaRepository users) {
        return new VocabularyService(provider, profiles, lessons, vocabularyWords, users);
    }
}
