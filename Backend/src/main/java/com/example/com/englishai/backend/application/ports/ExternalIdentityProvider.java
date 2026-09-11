package com.example.com.englishai.backend.application.ports;

import com.example.com.englishai.backend.domain.authentication.ExternalAuthProvider;
import java.util.Optional;

public interface ExternalIdentityProvider {
    ValidatedExternalIdentity validate(String credential);
    default ValidatedExternalIdentity validate(String credential, String nonce) { return validate(credential); }
    record ValidatedExternalIdentity(ExternalAuthProvider provider, String subject, String email,
                                     boolean emailVerified, String displayName) { }
}
