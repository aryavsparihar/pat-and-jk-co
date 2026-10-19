import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Only additions. The artworks collection is gone from the code, but its tables stay in the
  // database for now, so the previous release still runs if Vercel rolls back to it
  // (migrations-allow.txt); they hold nothing the site reads any more. The one foreign key from
  // Payload's lock table to them goes: the old release never relies on it, and development push,
  // which drops the tables with CASCADE, would otherwise fail trying to drop it a second time.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_artworks_fk";
  ALTER TYPE "public"."enum_members_standing" ADD VALUE IF NOT EXISTS 'on-hold' BEFORE 'suspended';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE IF NOT EXISTS 'record-created';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE IF NOT EXISTS 'record-changed';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE IF NOT EXISTS 'record-deleted';
  ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "standing_reason" varchar;
  ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "standing_changed_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "members" SET "standing" = 'suspended' WHERE "standing" = 'on-hold';
  ALTER TABLE "members" ALTER COLUMN "standing" SET DATA TYPE text;
  ALTER TABLE "members" ALTER COLUMN "standing" SET DEFAULT 'active'::text;
  DROP TYPE "public"."enum_members_standing";
  CREATE TYPE "public"."enum_members_standing" AS ENUM('active', 'suspended', 'erased');
  ALTER TABLE "members" ALTER COLUMN "standing" SET DEFAULT 'active'::"public"."enum_members_standing";
  ALTER TABLE "members" ALTER COLUMN "standing" SET DATA TYPE "public"."enum_members_standing" USING "standing"::"public"."enum_members_standing";
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'staff-signed-in', 'staff-sign-in-failed', 'staff-locked', 'access-refused', 'rate-limited', 'alert-sent', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-confirmed', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'application-reopened', 'application-reapply-allowed', 'application-under-review', 'application-withdrawn', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-payout-details-requested', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended', 'deletion-requested', 'member-erased', 'staff-erased', 'security-log-erased', 'server-error', 'bot-check-failed', 'portal-saved', 'staff-account-created', 'staff-account-changed', 'member-standing-changed', 'scheduled-task-ran');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  ALTER TABLE "members" DROP COLUMN "standing_reason";
  ALTER TABLE "members" DROP COLUMN "standing_changed_at";`)
}
