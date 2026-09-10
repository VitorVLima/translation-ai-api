package com.example.com.englishai.backend.presentation.rest.exception;

import com.example.com.englishai.backend.application.authentication.exception.InvalidCredentialsException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidRefreshTokenException;
import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidEmailVerificationCodeException;
import com.example.com.englishai.backend.application.authentication.exception.EmailVerificationRequiredException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidPasswordResetCodeException;
import com.example.com.englishai.backend.application.user.exception.CurrentUserNotFoundException;
import org.springframework.http.HttpHeaders;
import com.example.com.englishai.backend.application.user.exception.EmailAlreadyExistsException;
import com.example.com.englishai.backend.application.user.exception.UsernameAlreadyExistsException;
import com.example.com.englishai.backend.application.user.exception.UserAlreadyExistsException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ErrorResponse> handleRateLimit(RateLimitExceededException exception) {
        return RateLimitHttpResponse.entity(exception);
    }

    @ExceptionHandler(UserAlreadyExistsException.class)
    public ResponseEntity<ErrorResponse> handleUserAlreadyExists(UserAlreadyExistsException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(CurrentUserNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleCurrentUserNotFound(CurrentUserNotFoundException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Bearer")
                .body(new ErrorResponse("Unauthorized"));
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ErrorResponse> handleInvalidCredentials(
            InvalidCredentialsException exception
    ) {
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(EmailVerificationRequiredException.class)
    public ResponseEntity<ErrorResponse> handleEmailVerificationRequired(EmailVerificationRequiredException exception) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header(HttpHeaders.PRAGMA, "no-cache")
                .body(new ErrorResponse("Email verification required"));
    }

    @ExceptionHandler(InvalidRefreshTokenException.class)
    public ResponseEntity<ErrorResponse> handleInvalidRefreshToken(InvalidRefreshTokenException exception) {
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("Invalid refresh token"));
    }

    @ExceptionHandler(InvalidEmailVerificationCodeException.class)
    public ResponseEntity<ErrorResponse> handleInvalidEmailVerificationCode(InvalidEmailVerificationCodeException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid or expired verification code"));
    }

    @ExceptionHandler(InvalidPasswordResetCodeException.class)
    public ResponseEntity<ErrorResponse> handleInvalidPasswordResetCode(InvalidPasswordResetCodeException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid or expired password reset code"));
    }

    @ExceptionHandler(EmailAlreadyExistsException.class)
    public ResponseEntity<ErrorResponse> handleEmailAlreadyExists(
            EmailAlreadyExistsException exception
    ) {

        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(UsernameAlreadyExistsException.class)
    public ResponseEntity<ErrorResponse> handleUsernameAlreadyExists(
            UsernameAlreadyExistsException exception
    ) {

        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationErrorResponse> handleValidationErrors(
            MethodArgumentNotValidException exception
    ) {

        Map<String, String> errors = new HashMap<>();

        exception.getBindingResult()
                .getFieldErrors()
                .forEach(error ->
                        errors.put(
                                error.getField(),
                                error.getDefaultMessage()
                        )
                );

        ValidationErrorResponse response =
                new ValidationErrorResponse(
                        "Validation failed",
                        errors
                );

        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(response);
    }
}
