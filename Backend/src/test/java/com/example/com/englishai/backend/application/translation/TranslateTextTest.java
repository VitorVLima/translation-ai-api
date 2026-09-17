package com.example.com.englishai.backend.application.translation;

import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.llm.LlmRequest;
import com.example.com.englishai.backend.application.llm.LlmResponse;
import com.example.com.englishai.backend.application.llm.LlmResponseFormat;
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
                && r.systemPrompt().contains("ALWAYS in Brazilian Portuguese")
                && r.systemPrompt().contains("examples[].text MUST be an English sentence")
                && r.userPrompt().contains("<text>") && r.userPrompt().contains("Eu estudo inglês.")));
    }
    @Test void translatesEnglishToPortuguese() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("Olá"));
        assertThat(new TranslateText(provider, 5000).execute(new TranslateTextCommand("Hello", Language.ENGLISH, Language.PORTUGUESE)).translation()).isEqualTo("Olá");
    }
    @Test void returnsOriginalTextWhenItIsAlreadyInSelectedEnglishTarget() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"I would like tea.\",\"inputLanguage\":\"en\",\"enrichment\":{\"usage\":\"...\",\"examples\":[]}}"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand("I would like some tea.", Language.PORTUGUESE, Language.ENGLISH));
        assertThat(result.translation()).isEqualTo("I would like some tea.");
        assertThat(result.enrichment()).isNull();
    }
    @Test void returnsOriginalTextWhenItIsAlreadyInSelectedPortugueseTarget() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"Eu gostaria de chá.\",\"inputLanguage\":\"pt\",\"enrichment\":{\"usage\":\"...\",\"examples\":[]}}"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand("Eu gostaria de um chá.", Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.translation()).isEqualTo("Eu gostaria de um chá.");
        assertThat(result.enrichment()).isNull();
    }
    @Test void promptRequiresTheSelectedDirection() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"Eu vou à escola.\",\"inputLanguage\":\"en\",\"enrichment\":{\"usage\":\"Uso de uma expressão inglesa.\",\"examples\":[]}}"));
        new TranslateText(provider, 5000).execute(new TranslateTextCommand("I go to school.", Language.ENGLISH, Language.PORTUGUESE));
        verify(provider).complete(argThat(r -> r.systemPrompt().contains("strictly from the selected source language")
                && r.systemPrompt().contains("inputLanguage")));
    }
    @Test void shortTextReturnsValidatedEducationalEnrichment() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"Estou ansioso para te ver.\",\"enrichment\":{\"usage\":\"Expressa expectativa sobre algo futuro.\",\"examples\":[{\"text\":\"I am looking forward to the trip.\",\"translation\":\"Estou ansioso pela viagem.\"}]}}"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand("I am looking forward to seeing you.", Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.enrichment()).isNotNull();
        assertThat(result.enrichment().usage()).isEqualTo("Expressa expectativa sobre algo futuro.");
        assertThat(result.enrichment().examples().getFirst().text()).isEqualTo("I am looking forward to the trip.");
        assertThat(result.enrichment().examples().getFirst().translation()).isEqualTo("Estou ansioso pela viagem.");
        assertThat(result.enrichment().examples()).hasSize(1);
        verify(provider).complete(argThat(r -> r.responseFormat() == LlmResponseFormat.JSON));
    }
    @Test void portugueseToEnglishShortTextReturnsEnglishLearningEnrichment() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"I'd like some tea.\",\"enrichment\":{\"usage\":\"Use I'd like para fazer pedidos educados em inglês.\",\"examples\":[{\"text\":\"I'd like a coffee.\",\"translation\":\"Eu gostaria de um café.\"}]}}"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand("Eu gostaria de um chá.", Language.PORTUGUESE, Language.ENGLISH));
        assertThat(result.translation()).isEqualTo("I'd like some tea.");
        assertThat(result.enrichment()).isNotNull();
        assertThat(result.enrichment().usage()).contains("inglês");
        assertThat(result.enrichment().examples().getFirst().text()).isEqualTo("I'd like a coffee.");
    }
    @Test void shortTextAcceptsJsonCodeFenceFromProvider() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("```json\n{\"translation\":\"I go to school.\",\"enrichment\":{\"usage\":\"Go to school é uma expressão comum em inglês.\",\"examples\":[]}}\n```"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand("Eu vou à escola.", Language.PORTUGUESE, Language.ENGLISH));
        assertThat(result.enrichment()).isNotNull();
        assertThat(result.enrichment().usage()).contains("inglês");
    }
    @Test void textOverTwentyWordsReturnsOnlyTranslationAndExactlyTwentyIsShort() {
        LlmProvider provider = mock(LlmProvider.class);
        var useCase = new TranslateText(provider, 5000);
        String twenty = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty";
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"tradução\",\"enrichment\":{\"usage\":\"Learn this English phrase.\",\"examples\":[]}}"));
        assertThat(useCase.execute(new TranslateTextCommand(twenty, Language.ENGLISH, Language.PORTUGUESE)).enrichment()).isNotNull();
        verify(provider).complete(argThat(r -> r.responseFormat() == LlmResponseFormat.JSON));
        clearInvocations(provider);
        when(provider.complete(any())).thenReturn(new LlmResponse("plain translation"));
        String longText = twenty + " twenty-one";
        assertThat(useCase.execute(new TranslateTextCommand(longText, Language.ENGLISH, Language.PORTUGUESE)).enrichment()).isNull();
        verify(provider).complete(argThat(r -> r.responseFormat() == LlmResponseFormat.TEXT));
    }
    @Test void malformedShortResponseStillPreservesPlainTranslationFallback() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("plain translation"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand("I go to school", Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.translation()).isEqualTo("plain translation");
        assertThat(result.enrichment()).isNull();
    }
    @Test void longStructuredResponseUsesOnlyTranslationAndDropsEnrichment() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"Long translated text.\",\"inputLanguage\":\"en\",\"enrichment\":{\"usage\":\"must be ignored\"}}"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand(
                "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty-one twenty-two",
                Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.translation()).isEqualTo("Long translated text.");
        assertThat(result.enrichment()).isNull();
        verify(provider).complete(argThat(r -> r.responseFormat() == LlmResponseFormat.TEXT));
    }
    @Test void longStructuredResponseInsideCodeFenceIsNormalized() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("```json\n{\"translation\":\"Long translated text.\",\"enrichment\":null}\n```"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand(
                "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty-one twenty-two",
                Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.translation()).isEqualTo("Long translated text.");
        assertThat(result.enrichment()).isNull();
    }
    @Test void oneLevelStringifiedStructuredResponseIsNormalized() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("\"{\\\"translation\\\":\\\"Long translated text.\\\",\\\"enrichment\\\":null}\""));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand(
                "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty-one twenty-two",
                Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.translation()).isEqualTo("Long translated text.");
        assertThat(result.enrichment()).isNull();
    }
    @Test void nestedStructuredTranslationIsNormalizedWithoutUnboundedParsing() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("{\"translation\":\"{\\\"translation\\\":\\\"Olá\\\",\\\"inputLanguage\\\":\\\"en\\\",\\\"enrichment\\\":null}\"}"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand(
                "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty-one twenty-two",
                Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.translation()).isEqualTo("Olá");
        assertThat(result.enrichment()).isNull();
    }
    @Test void longNonJsonResponseRemainsPlainTranslationFallback() {
        LlmProvider provider = mock(LlmProvider.class);
        when(provider.complete(any())).thenReturn(new LlmResponse("plain long translation"));
        var result = new TranslateText(provider, 5000).execute(new TranslateTextCommand(
                "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty-one twenty-two",
                Language.ENGLISH, Language.PORTUGUESE));
        assertThat(result.translation()).isEqualTo("plain long translation");
        assertThat(result.enrichment()).isNull();
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
