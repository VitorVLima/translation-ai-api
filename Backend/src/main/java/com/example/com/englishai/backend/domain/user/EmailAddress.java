package com.example.com.englishai.backend.domain.user;

import java.util.Locale;

public final class EmailAddress {
    private EmailAddress() {
    }

    public static String normalize(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
