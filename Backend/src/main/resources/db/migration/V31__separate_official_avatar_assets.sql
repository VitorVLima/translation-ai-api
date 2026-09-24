ALTER TABLE predefined_avatars
    ADD COLUMN asset_source VARCHAR(16) NOT NULL DEFAULT 'RUNTIME';

ALTER TABLE predefined_avatars
    ADD CONSTRAINT ck_predefined_avatars_asset_source
        CHECK (asset_source IN ('OFFICIAL', 'RUNTIME'));

UPDATE predefined_avatars AS avatar
SET display_name = official.display_name,
    asset_key = official.asset_key,
    asset_source = 'OFFICIAL',
    updated_at = NOW()
FROM (VALUES
    ('avatar_default', 'Júlia', 'avatar-default.png'),
    ('avatar_01', 'Leo', 'avatar-01.png'),
    ('avatar_02', 'Luiz', 'avatar-02.png'),
    ('avatar_03', 'Larissa', 'avatar-03.png'),
    ('avatar_04', 'Paulo', 'avatar-04.png'),
    ('avatar_05', 'Roberta', 'avatar-05.png'),
    ('avatar_06', 'Lucas', 'avatar-06.png'),
    ('tutor_default', 'Maria', 'tutor-default.png'),
    ('interviewer_default', 'Rodrigo', 'interviewer-default.png'),
    ('friend_default', 'Jin', 'friend-default.png'),
    ('waiter_default', 'Layla', 'waiter-default.png')
) AS official(avatar_key, display_name, asset_key)
WHERE avatar.avatar_key = official.avatar_key;
