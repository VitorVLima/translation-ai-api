package com.example.com.englishai.backend.application.tts;

import com.example.com.englishai.backend.application.ports.TextToSpeechProvider;

public class SynthesizeSpeech {
    private final TextToSpeechProvider provider;
    private final int maxTextLength;

    public SynthesizeSpeech(TextToSpeechProvider provider, int maxTextLength) {
        this.provider = provider;
        this.maxTextLength = maxTextLength;
    }

    public SynthesizeSpeechResult execute(SynthesizeSpeechCommand command) {
        if (command == null || command.text() == null || command.text().isBlank() || command.language() == null)
            throw new InvalidTextToSpeechRequestException("Invalid speech synthesis request");
        if (command.text().length() > maxTextLength)
            throw new InvalidTextToSpeechRequestException("Text exceeds maximum length");
        TextToSpeechResult result = provider.synthesize(new TextToSpeechRequest(command.text(), command.language()));
        if (result == null || result.audio() == null || result.audio().length == 0 || result.contentType() == null || result.contentType().isBlank())
            throw new TextToSpeechProviderException("Speech synthesis provider returned an invalid response");
        return new SynthesizeSpeechResult(result.audio(), result.contentType());
    }
}
