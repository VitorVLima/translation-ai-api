CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_super_admin
    ON users (role)
    WHERE role = 'SUPER_ADMIN';
