-- 004: support "log out everywhere" after a password reset.
-- Every service rejects a JWT whose issued-at time is before users.password_changed_at.
-- Additive and nullable: existing rows/tokens are unaffected until a password is changed.
--
--   docker exec -i quickkart-postgres psql -U postgres -d quickkart -v ON_ERROR_STOP=1 < infrastructure/postgres/migrations/004_password_changed_at.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
