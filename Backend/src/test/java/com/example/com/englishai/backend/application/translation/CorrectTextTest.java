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

    @Test void supportsPortugueseAndAlreadyCorrectText() {
        var provider = new RecordingProvider(new LlmResponse("Eu fui à escola ontem."));
        assertThat(new CorrectText(provider, 5000).execute(new CorrectTextCommand("Eu fui à escola ontem.", Language.PORTUGUESE)).correctedText())
                .isEqualTo("Eu fui à escola ontem.");
        assertThat(provider.request.systemPrompt()).contains("pt");
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
