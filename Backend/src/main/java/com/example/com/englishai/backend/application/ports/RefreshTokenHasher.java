package com.example.com.englishai.backend.application.ports;

public interface RefreshTokenHasher {

    String hash(String refreshToken);
}
