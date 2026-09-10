package com.example.com.englishai.backend.application.ports;

import java.util.UUID;

public interface AuthenticationTokenValidator {

    UUID validateAndGetUserId(String token);
}
