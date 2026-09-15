package com.example.com.englishai.backend.infrastructure.security;

import com.example.com.englishai.backend.domain.user.UserRole;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class AdminBootstrap {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    private final UserJpaRepository users;
    private final String adminEmail;
    private final String superAdminEmail;

    public AdminBootstrap(UserJpaRepository users,
                          @Value("${ADMIN_BOOTSTRAP_EMAIL:}") String adminEmail,
                          @Value("${SUPER_ADMIN_BOOTSTRAP_EMAIL:}") String superAdminEmail) {
        this.users = users;
        this.adminEmail = adminEmail;
        this.superAdminEmail = superAdminEmail;
    }

    @PostConstruct
    public void promoteConfiguredUser() {
        bootstrapSuperAdmin();
        bootstrapAdmin();
    }

    private void bootstrapSuperAdmin() {
        String email = normalize(superAdminEmail);
        if (email.isBlank()) return;
        UserEntity candidate = users.findByEmail(email).orElse(null);
        if (candidate == null) {
            log.warn("SUPER_ADMIN_BOOTSTRAP status=user_not_found");
            return;
        }
        if (candidate.getRole() == UserRole.SUPER_ADMIN) {
            log.info("SUPER_ADMIN_BOOTSTRAP status=already_configured");
            return;
        }
        if (users.countByRole(UserRole.SUPER_ADMIN) > 0) {
            log.error("SUPER_ADMIN_BOOTSTRAP status=conflict");
            return;
        }
        candidate.setRole(UserRole.SUPER_ADMIN);
        users.save(candidate);
        log.info("SUPER_ADMIN_BOOTSTRAP status=success");
    }

    private void bootstrapAdmin() {
        String email = normalize(adminEmail);
        if (email.isBlank()) return;
        users.findByEmail(email).ifPresent(user -> {
            if (user.getRole() != UserRole.SUPER_ADMIN && user.getRole() != UserRole.ADMIN) {
                user.setRole(UserRole.ADMIN);
                users.save(user);
            }
        });
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
