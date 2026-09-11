package com.example.com.englishai.backend.infrastructure.persistence.entity;

import com.example.com.englishai.backend.domain.authentication.ExternalAuthProvider;
import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "external_auth_identities", uniqueConstraints = @UniqueConstraint(name = "uk_external_identity_provider_subject", columnNames = {"provider", "provider_subject"}))
public class ExternalIdentityEntity {
    @Id private UUID id;
    @Column(name="user_id", nullable=false) private UUID userId;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=32) private ExternalAuthProvider provider;
    @Column(name="provider_subject", nullable=false, length=255) private String providerSubject;
    @Column(name="created_at", nullable=false) private OffsetDateTime createdAt;
    protected ExternalIdentityEntity() { }
    public ExternalIdentityEntity(UUID id, UUID userId, ExternalAuthProvider provider, String subject, OffsetDateTime createdAt) {
        this.id=id; this.userId=userId; this.provider=provider; this.providerSubject=subject; this.createdAt=createdAt;
    }
    public UUID getId(){return id;} public UUID getUserId(){return userId;} public ExternalAuthProvider getProvider(){return provider;}
    public String getProviderSubject(){return providerSubject;} public OffsetDateTime getCreatedAt(){return createdAt;}
}
