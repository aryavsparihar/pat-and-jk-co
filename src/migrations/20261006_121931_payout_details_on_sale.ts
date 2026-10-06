import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-payout-details-requested' BEFORE 'kyc-consent-withdrawn';
  ALTER TABLE "kyc_records" ADD COLUMN "payout_requested_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  ALTER TABLE "kyc_records" DROP COLUMN "payout_requested_at";`)
}
