package com.example.com.englishai.backend.application.stt;

import com.example.com.englishai.backend.application.ports.SpeechToTextProvider;

public class TranscribeAudio {
    private final SpeechToTextProvider provider;
    private final long maxBytes;

    public TranscribeAudio(SpeechToTextProvider provider, long maxBytes) {
        this.provider = provider;
        this.maxBytes = maxBytes;
    }

    public SpeechToTextResult execute(TranscribeAudioCommand command) {
        if (command == null || command.audio() == null || command.audio().length == 0)
            throw new InvalidSpeechToTextRequestException("Audio file is required");
        if (command.audio().length > maxBytes)
            throw new SpeechToTextFileTooLargeException("Audio file is too large");
        SpeechToTextResult result = provider.transcribe(new SpeechToTextRequest(
                command.audio(), command.filename(), command.contentType(), command.language()));
        if (result == null || result.text() == null || result.text().isBlank() || result.language() == null)
            throw new SpeechToTextProviderException("Speech recognition provider returned an invalid response");
        return result;
    }
}
