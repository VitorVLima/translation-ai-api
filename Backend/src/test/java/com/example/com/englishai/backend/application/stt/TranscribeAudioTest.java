package com.example.com.englishai.backend.application.stt;

import com.example.com.englishai.backend.application.ports.SpeechToTextProvider;
import com.example.com.englishai.backend.application.translation.Language;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class TranscribeAudioTest {
    @Test
    void transcribesWithRequestedLanguage() {
        var fake = new FakeProvider();
        var result = new TranscribeAudio(fake, 100).execute(new TranscribeAudioCommand(new byte[]{1}, "a.wav", "audio/wav", Language.PORTUGUESE));
        assertEquals("Olá", result.text());
        assertEquals(Language.PORTUGUESE, fake.request.language());
    }

    @Test
    void allowsAutomaticDetectionWhenLanguageIsAbsent() {
        var fake = new FakeProvider();
        var result = new TranscribeAudio(fake, 100).execute(new TranscribeAudioCommand(new byte[]{1}, "a.wav", "audio/wav", null));
        assertNull(fake.request.language());
        assertEquals(Language.ENGLISH, result.language());
    }

    @Test
    void rejectsEmptyAndOversizedAudio() {
        var useCase = new TranscribeAudio(request -> new SpeechToTextResult("x", Language.ENGLISH), 1);
        assertThrows(InvalidSpeechToTextRequestException.class, () -> useCase.execute(new TranscribeAudioCommand(new byte[0], "a.wav", "audio/wav", null)));
        assertThrows(SpeechToTextFileTooLargeException.class, () -> useCase.execute(new TranscribeAudioCommand(new byte[]{1, 2}, "a.wav", "audio/wav", null)));
    }

    @Test
    void rejectsEmptyProviderResult() {
        var useCase = new TranscribeAudio(request -> new SpeechToTextResult(" ", Language.ENGLISH), 10);
        assertThrows(SpeechToTextProviderException.class, () -> useCase.execute(new TranscribeAudioCommand(new byte[]{1}, "a.wav", "audio/wav", null)));
    }

    private static final class FakeProvider implements SpeechToTextProvider {
        SpeechToTextRequest request;
        public SpeechToTextResult transcribe(SpeechToTextRequest request) { this.request = request; return new SpeechToTextResult("Olá", request.language() == null ? Language.ENGLISH : request.language()); }
    }
}
