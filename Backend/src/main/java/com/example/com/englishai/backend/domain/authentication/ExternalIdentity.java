package com.example.com.englishai.backend.domain.authentication;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ExternalIdentity(UUID id, UUID userId, ExternalAuthProvider provider,
                               String providerSubject, OffsetDateTime createdAt) { }
