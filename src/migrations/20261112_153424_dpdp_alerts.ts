import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'profile-unpublished' BEFORE 'record-created';
  ALTER TABLE "members" ADD COLUMN "consent_withdrawal_withdrawn_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "consent_withdrawal_unpublished_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "consent_withdrawal_unpublished_by_id" integer;
  ALTER TABLE "kyc_records" ADD COLUMN "member_code" varchar;
  ALTER TABLE "members" ADD CONSTRAINT "members_consent_withdrawal_unpublished_by_id_users_id_fk" FOREIGN KEY ("consent_withdrawal_unpublished_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "members_consent_withdrawal_consent_withdrawal_unpublishe_idx" ON "members" USING btree ("consent_withdrawal_unpublished_by_id");
  -- Every KYC record of someone already given an ID says whose it is
  UPDATE "kyc_records" k SET "member_code" = concat_ws(' · ', m."artist_id", m."partner_id")
    FROM "members" m
    WHERE m."id" = k."member_id" AND (m."artist_id" IS NOT NULL OR m."partner_id" IS NOT NULL);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "members" DROP CONSTRAINT "members_consent_withdrawal_unpublished_by_id_users_id_fk";
  
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'staff-signed-in', 'staff-sign-in-failed', 'staff-locked', 'access-refused', 'rate-limited', 'alert-sent', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-confirmed', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'application-reopened', 'application-reapply-allowed', 'application-under-review', 'application-withdrawn', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-payout-details-requested', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended', 'deletion-requested', 'member-erased', 'staff-erased', 'security-log-erased', 'server-error', 'bot-check-failed', 'portal-saved', 'staff-account-created', 'staff-account-changed', 'member-standing-changed', 'scheduled-task-ran', 'record-created', 'record-changed', 'record-deleted');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  DROP INDEX "members_consent_withdrawal_consent_withdrawal_unpublishe_idx";
  ALTER TABLE "members" DROP COLUMN "consent_withdrawal_withdrawn_at";
  ALTER TABLE "members" DROP COLUMN "consent_withdrawal_unpublished_at";
  ALTER TABLE "members" DROP COLUMN "consent_withdrawal_unpublished_by_id";
  ALTER TABLE "kyc_records" DROP COLUMN "member_code";`)
}
