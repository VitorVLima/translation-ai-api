package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.domain.authentication.*;
import java.util.Optional;
import java.util.UUID;

public interface ExternalIdentityRepository {
    Optional<ExternalIdentity> findByProviderAndSubject(ExternalAuthProvider provider, String subject);
    ExternalIdentity save(ExternalIdentity identity);
}
