package com.example.com.englishai.backend.integration.catalog;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class OfficialAvatarCatalogIntegrationTest {
    @Autowired JdbcTemplate jdbc;

    @Test void flywaySeedsTheOfficialCatalogAssetsForExistingAndNewSchemas() {
        Map<String, String> assets = jdbc.query("""
                SELECT avatar_key, asset_key
                FROM predefined_avatars
                WHERE asset_source = 'OFFICIAL'
                ORDER BY avatar_key
                """, resultSet -> {
            Map<String, String> rows = new java.util.LinkedHashMap<>();
            while (resultSet.next()) rows.put(resultSet.getString("avatar_key"), resultSet.getString("asset_key"));
            return rows;
        });

        assertThat(assets).containsExactlyInAnyOrderEntriesOf(Map.ofEntries(
                Map.entry("avatar_default", "avatar-default.png"),
                Map.entry("avatar_01", "avatar-01.png"),
                Map.entry("avatar_02", "avatar-02.png"),
                Map.entry("avatar_03", "avatar-03.png"),
                Map.entry("avatar_04", "avatar-04.png"),
                Map.entry("avatar_05", "avatar-05.png"),
                Map.entry("avatar_06", "avatar-06.png"),
                Map.entry("tutor_default", "tutor-default.png"),
                Map.entry("interviewer_default", "interviewer-default.png"),
                Map.entry("friend_default", "friend-default.png"),
                Map.entry("waiter_default", "waiter-default.png")
        ));
    }
}
