package com.example.com.englishai.backend.application.ports;

import java.util.UUID;

public interface AuthenticationTokenGenerator {

    String generate(UUID userId);
}
