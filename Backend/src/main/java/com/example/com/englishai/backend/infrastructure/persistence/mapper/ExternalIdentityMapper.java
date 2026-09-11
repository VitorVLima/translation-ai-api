package com.example.com.englishai.backend.infrastructure.persistence.mapper;

import com.example.com.englishai.backend.domain.authentication.ExternalIdentity;
import com.example.com.englishai.backend.infrastructure.persistence.entity.ExternalIdentityEntity;
import org.springframework.stereotype.Component;

@Component public class ExternalIdentityMapper {
    public ExternalIdentity toDomain(ExternalIdentityEntity e){return new ExternalIdentity(e.getId(),e.getUserId(),e.getProvider(),e.getProviderSubject(),e.getCreatedAt());}
    public ExternalIdentityEntity toEntity(ExternalIdentity i){return new ExternalIdentityEntity(i.id(),i.userId(),i.provider(),i.providerSubject(),i.createdAt());}
}
