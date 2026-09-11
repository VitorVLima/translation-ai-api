package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.domain.authentication.ExternalAuthProvider;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ExternalIdentityEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface ExternalIdentityJpaRepository extends JpaRepository<ExternalIdentityEntity, UUID> {
    Optional<ExternalIdentityEntity> findByProviderAndProviderSubject(ExternalAuthProvider provider, String providerSubject);
}
