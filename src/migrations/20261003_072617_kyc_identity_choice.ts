import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_kyc_records_id_choice" AS ENUM('aadhaar', 'other');
  CREATE TYPE "public"."enum_kyc_records_other_id_kind" AS ENUM('passport', 'voter-id', 'driving-licence');
  CREATE TYPE "public"."enum_kyc_records_aadhaar_check_result" AS ENUM('verified', 'not-verified', 'manual-review');
  ALTER TYPE "public"."enum_kyc_documents_kind" ADD VALUE 'other-id' BEFORE 'address-proof';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-aadhaar-checked';
  ALTER TABLE "kyc_records" ADD COLUMN "id_choice" "enum_kyc_records_id_choice";
  ALTER TABLE "kyc_records" ADD COLUMN "other_id_kind" "enum_kyc_records_other_id_kind";
  ALTER TABLE "kyc_records" ADD COLUMN "aadhaar_check_result" "enum_kyc_records_aadhaar_check_result";
  ALTER TABLE "kyc_records" ADD COLUMN "aadhaar_check_reasons" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "aadhaar_check_signer" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "aadhaar_check_signed_on" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "aadhaar_check_checked_at" timestamp(3) with time zone;
  ALTER TABLE "kyc_records" ADD COLUMN "aadhaar_check_mode" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_kyc_documents_kind";
  CREATE TYPE "public"."enum_kyc_documents_kind" AS ENUM('pan-card', 'masked-aadhaar', 'address-proof', 'bank-proof');
  ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_kyc_documents_kind" USING "kind"::"public"."enum_kyc_documents_kind";
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  ALTER TABLE "kyc_records" DROP COLUMN "id_choice";
  ALTER TABLE "kyc_records" DROP COLUMN "other_id_kind";
  ALTER TABLE "kyc_records" DROP COLUMN "aadhaar_check_result";
  ALTER TABLE "kyc_records" DROP COLUMN "aadhaar_check_reasons";
  ALTER TABLE "kyc_records" DROP COLUMN "aadhaar_check_signer";
  ALTER TABLE "kyc_records" DROP COLUMN "aadhaar_check_signed_on";
  ALTER TABLE "kyc_records" DROP COLUMN "aadhaar_check_checked_at";
  ALTER TABLE "kyc_records" DROP COLUMN "aadhaar_check_mode";
  DROP TYPE "public"."enum_kyc_records_id_choice";
  DROP TYPE "public"."enum_kyc_records_other_id_kind";
  DROP TYPE "public"."enum_kyc_records_aadhaar_check_result";`)
}
