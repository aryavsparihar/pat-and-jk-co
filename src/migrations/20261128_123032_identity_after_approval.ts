import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_kyc_records_id_type" ADD VALUE 'passport' BEFORE 'aadhaar';
  ALTER TYPE "public"."enum_kyc_records_other_id_kind" ADD VALUE 'national-id';
  ALTER TYPE "public"."enum_kyc_documents_kind" ADD VALUE 'passport-page' BEFORE 'other-id';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-identity-checked' BEFORE 'portal-approved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-identity-returned' BEFORE 'portal-approved';
  ALTER TABLE "kyc_records" ADD COLUMN "passport_sealed" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "passport_name_sealed" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "passport_country" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "passport_expiry" timestamp(3) with time zone;
  ALTER TABLE "kyc_records" ADD COLUMN "address_note" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "identity_check_sent_at" timestamp(3) with time zone;
  ALTER TABLE "kyc_records" ADD COLUMN "identity_check_checked_at" timestamp(3) with time zone;
  ALTER TABLE "kyc_records" ADD COLUMN "identity_check_checked_by_id" integer;
  ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_identity_check_checked_by_id_users_id_fk" FOREIGN KEY ("identity_check_checked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "kyc_records_identity_check_identity_check_checked_by_idx" ON "kyc_records" USING btree ("identity_check_checked_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rows that use the new values go back to what the older types allow
  await db.execute(sql`
   UPDATE "kyc_records" SET "id_type" = NULL WHERE "id_type" = 'passport';
  UPDATE "kyc_records" SET "other_id_kind" = NULL WHERE "other_id_kind" = 'national-id';
  DELETE FROM "kyc_documents" WHERE "kind" = 'passport-page';
  ALTER TABLE "kyc_records" DROP CONSTRAINT "kyc_records_identity_check_checked_by_id_users_id_fk";
  
  ALTER TABLE "kyc_records" ALTER COLUMN "id_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_kyc_records_id_type";
  CREATE TYPE "public"."enum_kyc_records_id_type" AS ENUM('pan', 'aadhaar');
  ALTER TABLE "kyc_records" ALTER COLUMN "id_type" SET DATA TYPE "public"."enum_kyc_records_id_type" USING "id_type"::"public"."enum_kyc_records_id_type";
  ALTER TABLE "kyc_records" ALTER COLUMN "other_id_kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_kyc_records_other_id_kind";
  CREATE TYPE "public"."enum_kyc_records_other_id_kind" AS ENUM('passport', 'voter-id', 'driving-licence');
  ALTER TABLE "kyc_records" ALTER COLUMN "other_id_kind" SET DATA TYPE "public"."enum_kyc_records_other_id_kind" USING "other_id_kind"::"public"."enum_kyc_records_other_id_kind";
  ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_kyc_documents_kind";
  CREATE TYPE "public"."enum_kyc_documents_kind" AS ENUM('pan-card', 'masked-aadhaar', 'other-id', 'address-proof', 'bank-proof', 'identity-photo', 'agreement-photo', 'agreement-signed', 'agreement-countersigned');
  ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_kyc_documents_kind" USING "kind"::"public"."enum_kyc_documents_kind";
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'staff-signed-in', 'staff-sign-in-failed', 'staff-locked', 'access-refused', 'rate-limited', 'alert-sent', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-confirmed', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'application-reopened', 'application-reapply-allowed', 'application-under-review', 'application-withdrawn', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-payout-details-requested', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended', 'deletion-requested', 'member-erased', 'staff-erased', 'security-log-erased', 'server-error', 'bot-check-failed', 'portal-saved', 'staff-account-created', 'staff-account-changed', 'member-standing-changed', 'scheduled-task-ran', 'profile-unpublished', 'record-created', 'record-changed', 'record-deleted');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  DROP INDEX "kyc_records_identity_check_identity_check_checked_by_idx";
  ALTER TABLE "kyc_records" DROP COLUMN "passport_sealed";
  ALTER TABLE "kyc_records" DROP COLUMN "passport_name_sealed";
  ALTER TABLE "kyc_records" DROP COLUMN "passport_country";
  ALTER TABLE "kyc_records" DROP COLUMN "passport_expiry";
  ALTER TABLE "kyc_records" DROP COLUMN "address_note";
  ALTER TABLE "kyc_records" DROP COLUMN "identity_check_sent_at";
  ALTER TABLE "kyc_records" DROP COLUMN "identity_check_checked_at";
  ALTER TABLE "kyc_records" DROP COLUMN "identity_check_checked_by_id";`)
}
