import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Least privilege for the running site, and Row-Level Security on every table.
 *
 * `pjk_app_access` is a group role that cannot sign in. It holds exactly what the site needs:
 * SELECT, INSERT, UPDATE and DELETE on the tables (no DDL, no TRUNCATE, not the owner, no
 * BYPASSRLS), and the sequences behind ids. The site connects as a login role that is a member of
 * it (created by hand in Neon, docs/SETUP.md), so this migration can run before that role exists.
 * Migrations keep running as the owner (DATABASE_URL_MIGRATE).
 *
 * Every table gets RLS with no policy except one for this group: anyone else who is ever given
 * access to a table (a reporting role, a new tool) sees no rows until a policy says otherwise.
 * The owner is exempt, so migrations still work (RLS is not FORCEd for that reason).
 *
 * Two tables are narrower: the security log is append-only for the site (it may add and read
 * entries, never change or delete them), and the migrations table is read-only to it.
 *
 * New tables in later migrations get the grants automatically (default privileges) but not RLS:
 * scripts/check-database-access.ts fails CI until the migration that adds them enables it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pjk_app_access') THEN
        CREATE ROLE pjk_app_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END
    $$;

    GRANT USAGE ON SCHEMA public TO pjk_app_access;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pjk_app_access;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pjk_app_access;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pjk_app_access;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO pjk_app_access;

    -- The security log: added to and read, never changed or deleted by the site
    REVOKE UPDATE, DELETE ON public.security_events FROM pjk_app_access;
    -- The migrations table: read by the site, written only by migrations
    REVOKE INSERT, UPDATE, DELETE ON public.payload_migrations FROM pjk_app_access;

    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
        EXECUTE format('DROP POLICY IF EXISTS pjk_app ON public.%I', t.tablename);
        IF t.tablename = 'security_events' THEN
          EXECUTE 'CREATE POLICY pjk_app ON public.security_events FOR SELECT TO pjk_app_access USING (true)';
          EXECUTE 'DROP POLICY IF EXISTS pjk_app_add ON public.security_events';
          EXECUTE 'CREATE POLICY pjk_app_add ON public.security_events FOR INSERT TO pjk_app_access WITH CHECK (true)';
        ELSIF t.tablename = 'payload_migrations' THEN
          EXECUTE 'CREATE POLICY pjk_app ON public.payload_migrations FOR SELECT TO pjk_app_access USING (true)';
        ELSE
          EXECUTE format(
            'CREATE POLICY pjk_app ON public.%I TO pjk_app_access USING (true) WITH CHECK (true)',
            t.tablename
          );
        END IF;
      END LOOP;
    END
    $$;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS pjk_app ON public.%I', t.tablename);
        EXECUTE format('DROP POLICY IF EXISTS pjk_app_add ON public.%I', t.tablename);
        EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.tablename);
      END LOOP;
    END
    $$;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM pjk_app_access;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM pjk_app_access;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM pjk_app_access;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM pjk_app_access;
    REVOKE USAGE ON SCHEMA public FROM pjk_app_access;
  `)
}
