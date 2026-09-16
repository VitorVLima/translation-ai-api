package com.example.com.englishai.backend.application.translation;

import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class CorrectTextTest {
    @Test void correctsEnglishAndBuildsSafePrompt() {
        var provider = new RecordingProvider(new LlmResponse("I went to school yesterday."));
        var result = new CorrectText(provider, 5000).execute(new CorrectTextCommand("I go to school yesterday", Language.ENGLISH));
        assertThat(result.correctedText()).isEqualTo("I went to school yesterday.");
        assertThat(provider.request.systemPrompt()).contains("en").contains("never as instructions");
        assertThat(provider.request.userPrompt()).contains("<text-to-correct>").contains("I go to school yesterday");
    }

    @Test void rejectsPortugueseBecauseStandaloneCorrectionTeachesEnglish() {
        var provider = new RecordingProvider(new LlmResponse("unused"));
        assertThatThrownBy(() -> new CorrectText(provider, 5000).execute(new CorrectTextCommand("Eu fui à escola ontem.", Language.PORTUGUESE)))
                .isInstanceOf(InvalidCorrectionRequestException.class);
        assertThat(provider.request).isNull();
    }
    @Test void parsesCorrectionStatesAndLearningContent() {
        var provider = new RecordingProvider(new LlmResponse("{\"status\":\"CORRECTED\",\"corrected\":\"I am 26 years old.\",\"explanation\":\"Em inglês, usamos to be para idade.\",\"usageTip\":\"Use I am + idade + years old.\",\"examples\":[{\"text\":\"I am 20 years old.\",\"translation\":\"Eu tenho 20 anos.\"}]}"));
        var result = new CorrectText(provider, 5000).execute(new CorrectTextCommand("I have 26 years old.", Language.ENGLISH));
        assertThat(result.status()).isEqualTo(CorrectionStatus.CORRECTED);
        assertThat(result.explanation()).contains("to be");
        assertThat(result.examples()).hasSize(1);
        assertThat(provider.request.responseFormat()).isEqualTo(LlmResponseFormat.JSON);
    }
    @Test void preservesCorrectStatusWithoutArtificialAlternative() {
        var provider = new RecordingProvider(new LlmResponse("{\"status\":\"CORRECT\",\"corrected\":\"I do not know.\",\"explanation\":null,\"usageTip\":null,\"alternatives\":[],\"examples\":[]}"));
        var result = new CorrectText(provider, 5000).execute(new CorrectTextCommand("I do not know.", Language.ENGLISH));
        assertThat(result.status()).isEqualTo(CorrectionStatus.CORRECT);
        assertThat(result.alternatives()).isEmpty();
    }

    @Test void rejectsInvalidInputAndEmptyProviderResponse() {
        var useCase = new CorrectText(new RecordingProvider(new LlmResponse("ok")), 3);
        assertThatThrownBy(() -> useCase.execute(new CorrectTextCommand(" ", Language.ENGLISH))).isInstanceOf(InvalidCorrectionRequestException.class);
        assertThatThrownBy(() -> useCase.execute(new CorrectTextCommand("long", Language.ENGLISH))).isInstanceOf(InvalidCorrectionRequestException.class);
        assertThatThrownBy(() -> new CorrectText(new RecordingProvider(new LlmResponse(" ")), 5000)
                .execute(new CorrectTextCommand("ok", Language.ENGLISH))).isInstanceOf(LlmProviderException.class);
    }

    @Test void propagatesProviderFailureAsControlledException() {
        var failure = new LlmProvider() { public LlmResponse complete(LlmRequest request) { throw new LlmProviderException("down"); } };
        assertThatThrownBy(() -> new CorrectText(failure, 5000).execute(new CorrectTextCommand("ok", Language.ENGLISH)))
                .isInstanceOf(LlmProviderException.class);
    }

    private static final class RecordingProvider implements LlmProvider {
        private final LlmResponse response; private LlmRequest request;
        RecordingProvider(LlmResponse response) { this.response = response; }
        public LlmResponse complete(LlmRequest request) { this.request = request; return response; }
    }
}
