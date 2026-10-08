package com.example.com.englishai.backend.presentation.rest.stt;

import com.example.com.englishai.backend.application.stt.SpeechToTextFileTooLargeException;
import com.example.com.englishai.backend.application.stt.SpeechToTextResult;
import com.example.com.englishai.backend.application.stt.TranscribeAudio;
import com.example.com.englishai.backend.application.translation.Language;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class SpeechToTextControllerTest {
    @Test void exactUploadLimitIsAcceptedAndOneExtraByteIsRejectedBeforeProvider() {
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        var provider = new TranscribeAudio(request -> {
            calls.incrementAndGet();
            return new SpeechToTextResult("hello", Language.ENGLISH);
        }, 1024L * 1024L);
        var controller = new SpeechToTextController(provider, 1);
        var exact = new MockMultipartFile("file", "voice.wav", "audio/wav", new byte[1024 * 1024]);
        assertThat(controller.transcribe(exact, null).getBody().text()).isEqualTo("hello");
        assertThat(calls.get()).isEqualTo(1);
        var tooLarge = new MockMultipartFile("file", "voice.wav", "audio/wav", new byte[1024 * 1024 + 1]);
        assertThatThrownBy(() -> controller.transcribe(tooLarge, null))
                .isInstanceOf(SpeechToTextFileTooLargeException.class);
        assertThat(calls.get()).isEqualTo(1);
    }
}
