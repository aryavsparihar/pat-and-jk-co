import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_members_erasure_source" AS ENUM('admin', 'data-request');
  ALTER TYPE "public"."enum_users_status" ADD VALUE 'erased';
  ALTER TYPE "public"."enum_members_standing" ADD VALUE 'erased';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'deletion-requested';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-erased';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'staff-erased';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'security-log-erased';
  CREATE SEQUENCE "public"."staff_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
  ALTER TABLE "users" ADD COLUMN "staff_ref" varchar;
  ALTER TABLE "users" ADD COLUMN "erasure_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "erasure_by_id" integer;
  ALTER TABLE "users" ADD COLUMN "erasure_reason" varchar;
  ALTER TABLE "members" ADD COLUMN "title" varchar;
  ALTER TABLE "members" ADD COLUMN "erasure_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "erasure_by_id" integer;
  ALTER TABLE "members" ADD COLUMN "erasure_source" "enum_members_erasure_source";
  ALTER TABLE "members" ADD COLUMN "erasure_reason" varchar;
  ALTER TABLE "members" ADD COLUMN "erasure_kept" varchar;
  ALTER TABLE "members" ADD COLUMN "deletion_request_requested_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD CONSTRAINT "users_erasure_by_id_users_id_fk" FOREIGN KEY ("erasure_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "members" ADD CONSTRAINT "members_erasure_by_id_users_id_fk" FOREIGN KEY ("erasure_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "users_staff_ref_idx" ON "users" USING btree ("staff_ref");
  CREATE INDEX "users_erasure_erasure_by_idx" ON "users" USING btree ("erasure_by_id");
  CREATE INDEX "members_title_idx" ON "members" USING btree ("title");
  CREATE INDEX "members_erasure_erasure_by_idx" ON "members" USING btree ("erasure_by_id");`)

  // Everyone already here: members are shown by their email until deleted, and staff are given
  // their references in the order their accounts were made
  await db.execute(sql`
    UPDATE "members" SET "title" = "email" WHERE "title" IS NULL;
    UPDATE "users" u SET "staff_ref" = 'ST-' || lpad(x.n::text, 4, '0')
      FROM (SELECT "id", row_number() OVER (ORDER BY "id") AS n FROM "users") x
      WHERE u."id" = x."id" AND u."staff_ref" IS NULL;
    SELECT setval('staff_ref_seq', GREATEST((SELECT count(*) FROM "users"), 1), (SELECT count(*) FROM "users") > 0);
    GRANT USAGE, SELECT ON SEQUENCE "staff_ref_seq" TO pjk_app_access;
  `)

  // The security log is append-only for the site (20261013_185333_app_role_and_rls). Deleting
  // someone must still take their addresses out of it, so this function, and only this, may
  // replace an address with the placeholder their record now shows. It refuses anyone who has
  // not actually been deleted, never removes an entry, and records in the log itself that it ran.
  // It runs as the owner (SECURITY DEFINER) with a fixed search path; only the app role may call it
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION public.erase_from_security_log(addresses text[], placeholder text)
    RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $fn$
    DECLARE
      changed integer := 0;
      more integer;
      address text;
    BEGIN
      IF placeholder IS NULL OR NOT (
        EXISTS (SELECT 1 FROM public.members WHERE title = placeholder AND standing = 'erased')
        OR EXISTS (SELECT 1 FROM public.users WHERE name = placeholder AND status = 'erased')
      ) THEN
        RAISE EXCEPTION 'erase_from_security_log: "%" is not someone who has been deleted', placeholder;
      END IF;
      FOREACH address IN ARRAY coalesce(addresses, '{}'::text[]) LOOP
        address := lower(trim(address));
        CONTINUE WHEN address IS NULL OR position('@' in address) = 0;
        UPDATE public.security_events SET email = placeholder, ip = NULL
          WHERE lower(email) = address;
        GET DIAGNOSTICS more = ROW_COUNT;
        changed := changed + more;
        UPDATE public.security_events SET detail = replace(detail, address, placeholder)
          WHERE strpos(detail, address) > 0;
        GET DIAGNOSTICS more = ROW_COUNT;
        changed := changed + more;
      END LOOP;
      INSERT INTO public.security_events (event, subject, detail, updated_at, created_at)
        VALUES ('security-log-erased', left(placeholder, 200),
                'Addresses erased from ' || changed || ' entries', now(), now());
      RETURN changed;
    END
    $fn$;
    REVOKE ALL ON FUNCTION public.erase_from_security_log(text[], text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.erase_from_security_log(text[], text) TO pjk_app_access;
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP FUNCTION IF EXISTS public.erase_from_security_log(text[], text);`)
  await db.execute(sql`
   ALTER TABLE "users" DROP CONSTRAINT "users_erasure_by_id_users_id_fk";
  
  ALTER TABLE "members" DROP CONSTRAINT "members_erasure_by_id_users_id_fk";
  
  ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'::text;
  DROP TYPE "public"."enum_users_status";
  CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'suspended');
  ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."enum_users_status";
  ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE "public"."enum_users_status" USING "status"::"public"."enum_users_status";
  ALTER TABLE "members" ALTER COLUMN "standing" SET DATA TYPE text;
  ALTER TABLE "members" ALTER COLUMN "standing" SET DEFAULT 'active'::text;
  DROP TYPE "public"."enum_members_standing";
  CREATE TYPE "public"."enum_members_standing" AS ENUM('active', 'suspended');
  ALTER TABLE "members" ALTER COLUMN "standing" SET DEFAULT 'active'::"public"."enum_members_standing";
  ALTER TABLE "members" ALTER COLUMN "standing" SET DATA TYPE "public"."enum_members_standing" USING "standing"::"public"."enum_members_standing";
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'staff-signed-in', 'staff-sign-in-failed', 'staff-locked', 'access-refused', 'rate-limited', 'alert-sent', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-confirmed', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'application-reopened', 'application-reapply-allowed', 'application-under-review', 'application-withdrawn', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-payout-details-requested', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  DROP INDEX "users_staff_ref_idx";
  DROP INDEX "users_erasure_erasure_by_idx";
  DROP INDEX "members_title_idx";
  DROP INDEX "members_erasure_erasure_by_idx";
  ALTER TABLE "users" DROP COLUMN "staff_ref";
  ALTER TABLE "users" DROP COLUMN "erasure_at";
  ALTER TABLE "users" DROP COLUMN "erasure_by_id";
  ALTER TABLE "users" DROP COLUMN "erasure_reason";
  ALTER TABLE "members" DROP COLUMN "title";
  ALTER TABLE "members" DROP COLUMN "erasure_at";
  ALTER TABLE "members" DROP COLUMN "erasure_by_id";
  ALTER TABLE "members" DROP COLUMN "erasure_source";
  ALTER TABLE "members" DROP COLUMN "erasure_reason";
  ALTER TABLE "members" DROP COLUMN "erasure_kept";
  ALTER TABLE "members" DROP COLUMN "deletion_request_requested_at";
  DROP TYPE "public"."enum_members_erasure_source";
  DROP SEQUENCE "public"."staff_ref_seq";`)
}
