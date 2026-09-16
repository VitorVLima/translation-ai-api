package com.example.com.englishai.backend.application.tts;

/** Provider-neutral speed multiplier relative to the configured language default. */
public record SpeechSettings(String voice, double speechRate) {
    public static final SpeechSettings DEFAULT = new SpeechSettings(null, 1.0);

    public SpeechSettings {
        if (voice != null && !voice.matches("[A-Za-z0-9_-]{1,128}"))
            throw new InvalidTextToSpeechRequestException("Invalid voice");
        if (!Double.isFinite(speechRate) || speechRate < 0.75 || speechRate > 1.25)
            throw new InvalidTextToSpeechRequestException("Invalid speech rate");
    }
}
