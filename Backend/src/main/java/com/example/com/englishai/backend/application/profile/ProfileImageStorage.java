package com.example.com.englishai.backend.application.profile;
public interface ProfileImageStorage { String store(byte[] bytes, String contentType); void delete(String key); byte[] read(String key); }
