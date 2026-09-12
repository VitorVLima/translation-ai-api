package com.example.com.englishai.backend.application.translation;

import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponse;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

class TranslateTextTest {
    @Test void translatesPortugueseToEnglishWithDelimitedPrompt() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("I study English."));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand("Eu estudo inglês.", Language.PORTUGUESE, Language.ENGLISH));
        assertThat(result.translation()).isEqualTo("I study English.");
        verify(provider).complete(argThat((LlmRequest r) -> r.systemPrompt().contains("pt") && r.systemPrompt().contains("en")
                && r.userPrompt().contains("<text>") && r.userPrompt().contains("Eu estudo inglês.")));
    }
    @Test void translatesEnglishToPortuguese() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("Olá"));
        assertThat(new TranslateText(provider, 5000).execute(new TranslateTextCommand("Hello", Language.ENGLISH, Language.PORTUGUESE)).translation()).isEqualTo("Olá");
    }
    @Test void rejectsInvalidCommandsAndLength() {
        assertThatThrownBy(() -> new TranslateTextCommand("x", Language.ENGLISH, Language.ENGLISH)).isInstanceOf(InvalidTranslationRequestException.class);
        assertThatThrownBy(() -> new TranslateTextCommand(" ", Language.ENGLISH, Language.PORTUGUESE)).isInstanceOf(InvalidTranslationRequestException.class);
        var provider = mock(LlmProvider.class);
        assertThatThrownBy(() -> new TranslateText(provider, 2).execute(new TranslateTextCommand("long", Language.ENGLISH, Language.PORTUGUESE))).isInstanceOf(InvalidTranslationRequestException.class);
        verifyNoInteractions(provider);
    }
    @Test void rejectsBlankProviderResponse() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("  "));
        assertThatThrownBy(() -> new TranslateText(provider, 5000).execute(new TranslateTextCommand("Hi", Language.ENGLISH, Language.PORTUGUESE))).isInstanceOf(LlmProviderException.class);
    }
    @Test void propagatesProviderFailure() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenThrow(new LlmProviderException("failed"));
        assertThatThrownBy(() -> new TranslateText(provider, 5000).execute(new TranslateTextCommand("Hi", Language.ENGLISH, Language.PORTUGUESE))).isInstanceOf(LlmProviderException.class);
    }
    @Test void languageCodesAreRestricted() {
        assertThat(Language.fromCode("pt")).isEqualTo(Language.PORTUGUESE);
        assertThatThrownBy(() -> Language.fromCode("es")).isInstanceOf(IllegalArgumentException.class);
    }
}
