package com.example.com.englishai.backend.application.ports;

public interface GoogleLoginNonce {
    String issue();
    boolean consume(String nonce);
}
