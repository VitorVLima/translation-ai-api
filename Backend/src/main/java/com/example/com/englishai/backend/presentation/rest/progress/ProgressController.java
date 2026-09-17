package com.example.com.englishai.backend.presentation.rest.progress;

import com.example.com.englishai.backend.application.progress.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/progress")
public class ProgressController {
    private final ProgressService service;
    public ProgressController(ProgressService service) { this.service=service; }
    @GetMapping
    public ProgressService.ProgressResponse get(@AuthenticationPrincipal UUID userId,
                                                 @RequestParam(required=false) ProgressPeriod period) {
        return service.get(userId, period == null ? ProgressPeriod.ALL_TIME : period);
    }
    @GetMapping("/timeline")
    public ProgressService.TimelineResponse timeline(@AuthenticationPrincipal UUID userId) {
        return service.timeline(userId);
    }
}
