package com.example.com.englishai.backend.infrastructure.persistence.repository;

import com.example.com.englishai.backend.application.ports.ExternalIdentityRepository;
import com.example.com.englishai.backend.domain.authentication.*;
import com.example.com.englishai.backend.infrastructure.persistence.mapper.ExternalIdentityMapper;
import org.springframework.stereotype.Repository;
import org.springframework.dao.DataIntegrityViolationException;
import com.example.com.englishai.backend.application.authentication.exception.ExternalIdentityConflictException;
import java.util.*;

@Repository public class ExternalIdentityRepositoryAdapter implements ExternalIdentityRepository {
    private final ExternalIdentityJpaRepository repository; private final ExternalIdentityMapper mapper;
    public ExternalIdentityRepositoryAdapter(ExternalIdentityJpaRepository r, ExternalIdentityMapper m){repository=r;mapper=m;}
    public Optional<ExternalIdentity> findByProviderAndSubject(ExternalAuthProvider p,String s){return repository.findByProviderAndProviderSubject(p,s).map(mapper::toDomain);}
    public ExternalIdentity save(ExternalIdentity i){
        try { return mapper.toDomain(repository.save(mapper.toEntity(i))); }
        catch (DataIntegrityViolationException e) { throw new ExternalIdentityConflictException(); }
    }
}
