package com.example.com.englishai.backend.application.chat;

import com.example.com.englishai.backend.application.llm.*;
import com.example.com.englishai.backend.application.ports.LlmProvider;
import com.example.com.englishai.backend.application.ports.LlmStreamingProvider;
import com.example.com.englishai.backend.application.translation.Language;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import java.util.List;

class ChatWithTutorTest {
    @Test void parsesReplyWithoutCorrection() {
        var provider = new Recording("{\"reply\":\"That sounds great!\",\"hasCorrection\":false,\"correctedText\":null}");
        var result = new ChatWithTutor(provider, 5000).execute(new ChatWithTutorCommand("I like running", Language.ENGLISH));
        assertThat(result.reply()).isEqualTo("That sounds great!"); assertThat(result.hasCorrection()).isFalse(); assertThat(result.correctedText()).isNull();
        assertThat(provider.request.systemPrompt()).contains("en").contains("strict valid JSON")
                .contains("Continue the conversation").contains("Never simply repeat")
                .contains("ask a concise, natural follow-up question")
                .contains("For EVERY current user message")
                .contains("hasCorrection MUST be true")
                .contains("never history or assistant messages")
                .contains("She doesn't like soccer")
                .contains("Never identify yourself as Qwen, Ollama, Gemini, OpenAI");
        assertThat(provider.request.userPrompt()).contains("<current-user-message>\nI like running\n</current-user-message>");
        assertThat(provider.request.responseFormat()).isEqualTo(LlmResponseFormat.JSON);
    }
    @Test void parsesCorrectionAndPortugueseLanguage() {
        var provider = new Recording("{\"reply\":\"Que legal!\",\"hasCorrection\":true,\"correctedText\":\"Eu fui ontem.\"}");
        var result = new ChatWithTutor(provider, 5000).execute(new ChatWithTutorCommand("Eu foi ontem.", Language.PORTUGUESE));
        assertThat(result.hasCorrection()).isTrue(); assertThat(result.correctedText()).isEqualTo("Eu fui ontem."); assertThat(provider.request.systemPrompt()).contains("pt");
    }
    @Test void rejectsMalformedResponsesAndInvalidRequests() {
        var useCase = new ChatWithTutor(new Recording("{}"), 3);
        assertThatThrownBy(() -> useCase.execute(new ChatWithTutorCommand(" ", Language.ENGLISH))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> useCase.execute(new ChatWithTutorCommand("long", Language.ENGLISH))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> new ChatWithTutor(new Recording("{\"reply\":\"x\",\"hasCorrection\":true,\"correctedText\":null}"), 5000).execute(new ChatWithTutorCommand("a", Language.ENGLISH))).isInstanceOf(LlmProviderException.class);
        assertThatThrownBy(() -> new ChatWithTutor(new Recording("not json"), 5000).execute(new ChatWithTutorCommand("a", Language.ENGLISH))).isInstanceOf(LlmProviderException.class);
    }
    @Test void providerFailureIsControlled() {
        LlmProvider provider = request -> { throw new LlmProviderException("offline"); };
        assertThatThrownBy(() -> new ChatWithTutor(provider, 5000).execute(new ChatWithTutorCommand("hello", Language.ENGLISH))).isInstanceOf(LlmProviderException.class);
    }
    @Test void rejectsReplyThatExactlyEchoesTheMessage() {
        var provider = new Recording("{\"reply\":\"Hello, my name is Stela.\",\"hasCorrection\":false,\"correctedText\":null}");
        assertThatThrownBy(() -> new ChatWithTutor(provider, 5000)
                .execute(new ChatWithTutorCommand(" Hello, my name is Stela. ", Language.ENGLISH)))
                .isInstanceOf(LlmProviderException.class)
                .hasMessageContaining("echoed");
    }
    @Test void keepsConversationalReplySeparateFromCorrection() {
        var provider = new Recording("{\"reply\":\"Nice! What did you train at the gym?\",\"hasCorrection\":true,\"correctedText\":\"I went to the gym yesterday.\"}");
        var result = new ChatWithTutor(provider, 5000)
                .execute(new ChatWithTutorCommand("I go to the gym yesterday.", Language.ENGLISH));
        assertThat(result.reply()).isNotEqualTo(result.correctedText());
        assertThat(result.reply()).contains("What did you train");
    }
    @Test void streamingProviderIsUsedOnceAndReturnsStructuredResult() {
        var provider = new StreamingRecording("{\"reply\":\"Hi there!\",\"hasCorrection\":true,\"correctedText\":\"I went yesterday.\"}");
        var chunks = new java.util.ArrayList<String>();
        var result = new ChatWithTutor(provider, 5000).stream(new ChatWithTutorCommand("I go yesterday.", Language.ENGLISH), chunks::add);
        assertThat(provider.calls).isEqualTo(1);
        assertThat(chunks).isNotEmpty();
        assertThat(result.reply()).isEqualTo("Hi there!");
        assertThat(provider.request.responseFormat()).isEqualTo(LlmResponseFormat.JSON);
    }
    @Test void includesHistoryInOrderBeforeCurrentMessage() {
        var provider = new Recording("{\"reply\":\"It is Red Dead Redemption 2.\",\"hasCorrection\":false,\"correctedText\":null}");
        new ChatWithTutor(provider, 5000).execute(new ChatWithTutorCommand("What is my favorite game?", Language.ENGLISH,
                List.of(new ChatHistoryMessage(ChatRole.USER, "My favorite game is Red Dead Redemption 2."),
                        new ChatHistoryMessage(ChatRole.ASSISTANT, "That's a great game!"))));
        assertThat(provider.request.userPrompt()).contains("<conversation-history>")
                .contains("<message role=\"user\">\nMy favorite game is Red Dead Redemption 2.\n</message>")
                .contains("<message role=\"assistant\">\nThat's a great game!\n</message>")
                .contains("<current-user-message>\nWhat is my favorite game?\n</current-user-message>");
        assertThat(provider.request.userPrompt().indexOf("My favorite game"))
                .isLessThan(provider.request.userPrompt().indexOf("What is my favorite game?"));
    }
    @Test void rejectsInvalidHistory() {
        var useCase = new ChatWithTutor(new Recording("{\"reply\":\"ok\",\"hasCorrection\":false,\"correctedText\":null}"), 5);
        assertThatThrownBy(() -> useCase.execute(new ChatWithTutorCommand("hello", Language.ENGLISH,
                List.of(new ChatHistoryMessage(ChatRole.USER, ""))))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> useCase.execute(new ChatWithTutorCommand("hello", Language.ENGLISH,
                java.util.stream.IntStream.range(0, 11).mapToObj(i -> new ChatHistoryMessage(ChatRole.USER, "x")).toList())))
                .isInstanceOf(RuntimeException.class);
    }
    private static final class Recording implements LlmProvider { private final String content; private LlmRequest request; Recording(String content){this.content=content;} public LlmResponse complete(LlmRequest request){this.request=request; return new LlmResponse(content);} }
    private static final class StreamingRecording implements LlmProvider, LlmStreamingProvider {
        private final String content; private LlmRequest request; private int calls;
        StreamingRecording(String content) { this.content = content; }
        public LlmResponse complete(LlmRequest request) { this.request = request; return new LlmResponse(content); }
        public void stream(LlmRequest request, java.util.function.Consumer<String> sink) { this.request = request; calls++; sink.accept(content.substring(0, content.length() / 2)); sink.accept(content.substring(content.length() / 2)); }
    }
}
