package com.example.com.englishai.backend.presentation.rest.admin;

import com.example.com.englishai.backend.domain.user.UserRole;
import com.example.com.englishai.backend.infrastructure.persistence.entity.UserEntity;
import com.example.com.englishai.backend.infrastructure.persistence.repository.UserJpaRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {
    private final UserJpaRepository users;

    public AdminUserController(UserJpaRepository users) { this.users = users; }

    @GetMapping
    public List<UserSummary> list(@RequestParam(required = false) String search) {
        String term = search == null ? "" : search.trim().toLowerCase(java.util.Locale.ROOT);
        return users.findAll().stream()
                .filter(u -> term.isBlank() || u.getEmail().toLowerCase(java.util.Locale.ROOT).contains(term)
                        || u.getUsername().toLowerCase(java.util.Locale.ROOT).contains(term))
                .sorted(Comparator.comparing(UserEntity::getCreatedAt))
                .map(UserSummary::from).toList();
    }

    @PatchMapping("/{id}/role")
    public UserSummary changeRole(@PathVariable UUID id, @Valid @RequestBody RoleRequest request,
                                  @org.springframework.security.core.annotation.AuthenticationPrincipal UUID actorId) {
        if (actorId != null && actorId.equals(id)) throw new IllegalStateException("Self role change is not allowed");
        UserEntity target = users.findById(id).orElseThrow(java.util.NoSuchElementException::new);
        if (target.getRole() == UserRole.SUPER_ADMIN) throw new IllegalStateException("Protected role");
        UserRole next;
        try { next = UserRole.valueOf(request.role().trim().toUpperCase(java.util.Locale.ROOT)); }
        catch (Exception ex) { throw new IllegalArgumentException("Invalid role"); }
        if (next == UserRole.SUPER_ADMIN) throw new IllegalArgumentException("Invalid role");
        UserRole previous = target.getRole();
        target.setRole(next);
        users.save(target);
        org.slf4j.LoggerFactory.getLogger(AdminUserController.class).info("ADMIN_ROLE_CHANGE actor_id={} target_id={} from={} to={} status=success", actorId, id, previous, next);
        return UserSummary.from(target);
    }

    public record RoleRequest(@NotNull String role) {}
    public record UserSummary(UUID id, String email, String username, UserRole role, OffsetDateTime createdAt) {
        static UserSummary from(UserEntity u) { return new UserSummary(u.getId(), u.getEmail(), u.getUsername(), u.getRole(), u.getCreatedAt()); }
    }
}
