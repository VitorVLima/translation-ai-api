package com.example.com.englishai.backend.presentation.rest.conversation;
import com.example.com.englishai.backend.application.admin.CatalogService; import com.example.com.englishai.backend.application.catalog.AssistantIdentityResolver; import org.springframework.web.bind.annotation.*; import java.util.*;
@RestController @RequestMapping("/api/v1/conversation-scenarios") public class ScenarioController {
 private final CatalogService service; private final AssistantIdentityResolver identities; public ScenarioController(CatalogService service,AssistantIdentityResolver identities){this.service=service;this.identities=identities;}
 @GetMapping public List<ScenarioResponse> list(){return service.publicScenarios().stream().map(s->{var identity=identities.resolve(s.getAssistantAvatarKey());return new ScenarioResponse(s.getScenarioKey(),s.getDisplayName(),s.getDescription(),identity.displayName(),identity.avatarKey(),identity.imageUrl());}).toList();}
 public record ScenarioResponse(String id,String displayName,String description,String assistantDisplayName,String assistantAvatarKey,String assistantAvatarImageUrl){}
}
