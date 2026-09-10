package com.example.com.englishai.backend.presentation.rest.validation;

import com.example.com.englishai.backend.presentation.rest.auth.dto.RegisterRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class RegisterRequestValidationTest {

    private static Validator validator;
    private static AutoCloseable validatorFactory;

    @BeforeAll
    static void setUp() {
        var factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
        validatorFactory = factory::close;
    }

    @AfterAll
    static void tearDown() throws Exception {
        validatorFactory.close();
    }

    @Test
    void shouldAcceptPasswordBelow72Utf8Bytes() {
        assertThat(passwordViolations("a".repeat(71))).isEmpty();
    }

    @Test
    void shouldAcceptPasswordWithExactly72Utf8Bytes() {
        assertThat(passwordViolations("a".repeat(72))).isEmpty();
    }

    @Test
    void shouldRejectPasswordAbove72Utf8Bytes() {
        assertThat(passwordViolations("a".repeat(73)))
                .contains("Password must be at most 72 bytes in UTF-8");
    }

    @Test
    void shouldRejectUnicodePasswordAbove72BytesEvenWithFewerThan72Characters() {
        String password = "😀".repeat(19); // 19 code points, 76 UTF-8 bytes

        assertThat(password.length()).isLessThan(72);
        assertThat(passwordViolations(password))
                .contains("Password must be at most 72 bytes in UTF-8");
    }

    private Set<String> passwordViolations(String password) {
        RegisterRequest request = new RegisterRequest("user@test.com", "test-user", password);
        return validator.validateProperty(request, "password").stream()
                .map(violation -> violation.getMessage())
                .collect(Collectors.toSet());
    }
}
