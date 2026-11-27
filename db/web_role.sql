-- The account the website logs in with: it can read every table and nothing
-- more. The loader and db/migrate.mjs keep using the owner account.
--
-- Run as a superuser (creating a role needs one), once per database. Safe to
-- repeat:
--   sudo -u postgres psql -d na3db < db/web_role.sql
-- Then give it a password, typed at the prompt so it stays out of history:
--   sudo -u postgres psql -d na3db -c '\password na3db_web'

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'na3db_web') THEN
        CREATE ROLE na3db_web LOGIN;
    END IF;
END $$;

-- Every transaction starts read-only. The grants below are what really stop a
-- write; this is a second lock in case a grant is ever widened by mistake.
ALTER ROLE na3db_web SET default_transaction_read_only = on;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO na3db_web', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO na3db_web;
REVOKE CREATE ON SCHEMA public FROM na3db_web;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO na3db_web;

-- Tables a later migration creates are readable too, without running this
-- again. Migrations run as the database owner, so the rule is set for that role.
DO $$
BEGIN
    EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO na3db_web',
        (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()));
END $$;
