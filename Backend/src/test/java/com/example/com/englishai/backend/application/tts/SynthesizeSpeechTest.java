package com.example.com.englishai.backend.application.tts;

import com.example.com.englishai.backend.application.ports.TextToSpeechProvider;
import com.example.com.englishai.backend.application.translation.Language;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SynthesizeSpeechTest {
    @Test void validRequestIsForwarded() {
        var fake = new Fake((request) -> new TextToSpeechResult(new byte[]{1,2}, "audio/wav"));
        var result = new SynthesizeSpeech(fake, 3000).execute(new SynthesizeSpeechCommand("Hello", Language.ENGLISH));
        assertArrayEquals(new byte[]{1,2}, result.audio());
        assertEquals(Language.ENGLISH, fake.request.language());
    }
    @Test void rejectsInvalidInput() {
        var useCase = new SynthesizeSpeech(request -> new TextToSpeechResult(new byte[]{1}, "audio/wav"), 3);
        assertThrows(InvalidTextToSpeechRequestException.class, () -> useCase.execute(new SynthesizeSpeechCommand(" ", Language.ENGLISH)));
        assertThrows(InvalidTextToSpeechRequestException.class, () -> useCase.execute(new SynthesizeSpeechCommand("long", Language.ENGLISH)));
        assertThrows(InvalidTextToSpeechRequestException.class, () -> useCase.execute(new SynthesizeSpeechCommand("ok", null)));
    }
    @Test void rejectsEmptyProviderAudio() {
        var useCase = new SynthesizeSpeech(request -> new TextToSpeechResult(new byte[0], "audio/wav"), 20);
        assertThrows(TextToSpeechProviderException.class, () -> useCase.execute(new SynthesizeSpeechCommand("ok", Language.PORTUGUESE)));
    }
    @Test void propagatesProviderFailure() {
        var useCase = new SynthesizeSpeech(request -> { throw new TextToSpeechProviderException("failed"); }, 20);
        assertThrows(TextToSpeechProviderException.class, () -> useCase.execute(new SynthesizeSpeechCommand("ok", Language.ENGLISH)));
    }
    private static final class Fake implements TextToSpeechProvider {
        final java.util.function.Function<TextToSpeechRequest, TextToSpeechResult> fn; TextToSpeechRequest request;
        Fake(java.util.function.Function<TextToSpeechRequest, TextToSpeechResult> fn){this.fn=fn;}
        public TextToSpeechResult synthesize(TextToSpeechRequest request){this.request=request;return fn.apply(request);}
    }
}
