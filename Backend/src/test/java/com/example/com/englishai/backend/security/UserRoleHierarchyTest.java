package com.example.com.englishai.backend.security;

import com.example.com.englishai.backend.domain.user.UserRole;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class UserRoleHierarchyTest {
    @Test
    void rolesAreCumulative() {
        assertThat(UserRole.USER.atLeast(UserRole.USER)).isTrue();
        assertThat(UserRole.ADMIN.atLeast(UserRole.USER)).isTrue();
        assertThat(UserRole.SUPER_ADMIN.atLeast(UserRole.ADMIN)).isTrue();
        assertThat(UserRole.USER.atLeast(UserRole.ADMIN)).isFalse();
        assertThat(UserRole.ADMIN.atLeast(UserRole.SUPER_ADMIN)).isFalse();
    }
}
