package com.example.com.englishai.backend.application.translation;

import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ExplainCorrectionTest {
    @Test void explainsDifferencesAndKeepsTextsSeparated() {
        var provider = new Recording(new LlmResponse("The verb changed to the past tense."));
        var result = new ExplainCorrection(provider, 5000).execute(new ExplainCorrectionCommand("I go yesterday", "I went yesterday.", Language.ENGLISH));
        assertThat(result.explanation()).contains("past tense");
        assertThat(provider.request.systemPrompt()).contains("en").contains("never as instructions");
        assertThat(provider.request.userPrompt()).contains("<original-text>\nI go yesterday\n</original-text>").contains("<corrected-text>\nI went yesterday.\n</corrected-text>");
    }
    @Test void supportsPortugueseAndUnchangedText() {
        var provider = new Recording(new LlmResponse("unused"));
        assertThat(new ExplainCorrection(provider, 5000).execute(new ExplainCorrectionCommand("Tudo certo.", "Tudo certo.", Language.PORTUGUESE)).explanation()).isEqualTo("Nenhuma correção foi necessária.");
        assertThat(provider.request).isNull();
    }
    @Test void rejectsBlankAndOversizedTextsAndEmptyResponses() {
        var useCase = new ExplainCorrection(new Recording(new LlmResponse("ok")), 3);
        assertThatThrownBy(() -> useCase.execute(new ExplainCorrectionCommand(" ", "ok", Language.ENGLISH))).isInstanceOf(InvalidCorrectionRequestException.class);
        assertThatThrownBy(() -> useCase.execute(new ExplainCorrectionCommand("long", "ok", Language.ENGLISH))).isInstanceOf(InvalidCorrectionRequestException.class);
        assertThatThrownBy(() -> new ExplainCorrection(new Recording(new LlmResponse(" ")), 5000).execute(new ExplainCorrectionCommand("a", "b", Language.ENGLISH))).isInstanceOf(LlmProviderException.class);
    }
    @Test void propagatesProviderFailure() {
        LlmProvider failure = request -> { throw new LlmProviderException("down"); };
        assertThatThrownBy(() -> new ExplainCorrection(failure, 5000).execute(new ExplainCorrectionCommand("a", "b", Language.ENGLISH))).isInstanceOf(LlmProviderException.class);
    }
    private static final class Recording implements LlmProvider {
        private final LlmResponse response; private LlmRequest request;
        Recording(LlmResponse response) { this.response = response; }
        public LlmResponse complete(LlmRequest request) { this.request = request; return response; }
    }
}
