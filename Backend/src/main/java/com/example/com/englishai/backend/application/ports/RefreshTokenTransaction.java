package com.example.com.englishai.backend.application.ports;

import java.util.function.Function;

public interface RefreshTokenTransaction {

    <T> T execute(Function<RefreshTokenRepository, T> operation);
}
