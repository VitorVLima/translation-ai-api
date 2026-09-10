package com.example.com.englishai.backend.application.ports;
import com.example.com.englishai.backend.domain.authentication.PasswordResetCode; import java.util.*;
public interface PasswordResetCodeRepository { PasswordResetCode save(PasswordResetCode code); List<PasswordResetCode> findByUserIdForUpdate(UUID userId); }
