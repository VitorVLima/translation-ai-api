package com.example.com.englishai.backend.presentation.rest.exception;

import com.example.com.englishai.backend.application.authentication.exception.InvalidCredentialsException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidRefreshTokenException;
import com.example.com.englishai.backend.application.authentication.exception.RateLimitExceededException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidEmailVerificationCodeException;
import com.example.com.englishai.backend.application.authentication.exception.EmailVerificationRequiredException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidPasswordResetCodeException;
import com.example.com.englishai.backend.application.authentication.exception.InvalidExternalIdentityException;
import com.example.com.englishai.backend.application.authentication.exception.AuthenticationMethodConflictException;
import com.example.com.englishai.backend.application.llm.LlmProviderException;
import com.example.com.englishai.backend.application.translation.InvalidTranslationRequestException;
import com.example.com.englishai.backend.application.translation.InvalidCorrectionRequestException;
import com.example.com.englishai.backend.application.user.exception.CurrentUserNotFoundException;
import org.springframework.http.HttpHeaders;
import com.example.com.englishai.backend.application.user.exception.EmailAlreadyExistsException;
import com.example.com.englishai.backend.application.user.exception.UsernameAlreadyExistsException;
import com.example.com.englishai.backend.application.user.exception.UserAlreadyExistsException;
import com.example.com.englishai.backend.application.stt.InvalidSpeechToTextRequestException;
import com.example.com.englishai.backend.application.stt.SpeechToTextFileTooLargeException;
import com.example.com.englishai.backend.application.stt.SpeechToTextProviderException;
import com.example.com.englishai.backend.application.tts.InvalidTextToSpeechRequestException;
import com.example.com.englishai.backend.application.tts.TextToSpeechProviderException;
import com.example.com.englishai.backend.application.profile.InvalidProfileRequestException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;
import java.util.NoSuchElementException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(com.example.com.englishai.backend.application.conversation.ConversationLimitReachedException.class)
    public ResponseEntity<ErrorResponse> handleConversationLimit(com.example.com.englishai.backend.application.conversation.ConversationLimitReachedException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(exception.getMessage()));
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NoSuchElementException exception) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Resource not found"));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ErrorResponse> handleInvalidState(IllegalStateException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Operation is not available"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid request"));
    }

    @ExceptionHandler(InvalidProfileRequestException.class)
    public ResponseEntity<ErrorResponse> handleInvalidProfile(InvalidProfileRequestException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid profile request"));
    }

    @ExceptionHandler(TextToSpeechProviderException.class)
    public ResponseEntity<ErrorResponse> handleTextToSpeechProviderFailure(TextToSpeechProviderException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new ErrorResponse("Speech synthesis service temporarily unavailable"));
    }

    @ExceptionHandler(InvalidTextToSpeechRequestException.class)
    public ResponseEntity<ErrorResponse> handleInvalidTextToSpeechRequest(InvalidTextToSpeechRequestException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid speech synthesis request"));
    }

    @ExceptionHandler(SpeechToTextProviderException.class)
    public ResponseEntity<ErrorResponse> handleSpeechToTextProviderFailure(SpeechToTextProviderException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new ErrorResponse("Speech recognition service temporarily unavailable"));
    }

    @ExceptionHandler(InvalidSpeechToTextRequestException.class)
    public ResponseEntity<ErrorResponse> handleInvalidSpeechToTextRequest(InvalidSpeechToTextRequestException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid speech-to-text request"));
    }

    @ExceptionHandler(SpeechToTextFileTooLargeException.class)
    public ResponseEntity<ErrorResponse> handleSpeechToTextFileTooLarge(SpeechToTextFileTooLargeException exception) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(new ErrorResponse("Audio file is too large"));
    }

    @ExceptionHandler(LlmProviderException.class)
    public ResponseEntity<ErrorResponse> handleLlmProviderFailure(LlmProviderException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(new ErrorResponse("AI service temporarily unavailable"));
    }

    @ExceptionHandler(InvalidTranslationRequestException.class)
    public ResponseEntity<ErrorResponse> handleInvalidTranslationRequest(InvalidTranslationRequestException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid translation request"));
    }


    @ExceptionHandler(InvalidCorrectionRequestException.class)
    public ResponseEntity<ErrorResponse> handleInvalidCorrectionRequest(InvalidCorrectionRequestException exception) {
        return ResponseEntity.badRequest().body(new ErrorResponse("Invalid correction request"));
    }

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

    @ExceptionHandler(InvalidExternalIdentityException.class)
    public ResponseEntity<ErrorResponse> handleInvalidExternalIdentity(InvalidExternalIdentityException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Invalid external identity"));
    }

    @ExceptionHandler(AuthenticationMethodConflictException.class)
    public ResponseEntity<ErrorResponse> handleAuthenticationMethodConflict(AuthenticationMethodConflictException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse(exception.getMessage()));
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
