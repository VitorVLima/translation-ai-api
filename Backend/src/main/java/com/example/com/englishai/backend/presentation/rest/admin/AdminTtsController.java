package com.example.com.englishai.backend.presentation.rest.admin;

import com.example.com.englishai.backend.application.ports.TextToSpeechProvider;
import com.example.com.englishai.backend.application.tts.TtsVoice;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/v1/admin/tts")
public class AdminTtsController {
    private final TextToSpeechProvider provider;
    public AdminTtsController(TextToSpeechProvider provider) { this.provider = provider; }
    @GetMapping("/voices")
    public List<TtsVoice> voices() { return provider.voices(); }
}
