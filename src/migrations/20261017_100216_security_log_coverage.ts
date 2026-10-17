import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'server-error';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'bot-check-failed';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'portal-saved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'staff-account-created';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'staff-account-changed';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-standing-changed';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'scheduled-task-ran';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'staff-signed-in', 'staff-sign-in-failed', 'staff-locked', 'access-refused', 'rate-limited', 'alert-sent', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-confirmed', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'application-reopened', 'application-reapply-allowed', 'application-under-review', 'application-withdrawn', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-payout-details-requested', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended', 'deletion-requested', 'member-erased', 'staff-erased', 'security-log-erased');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";`)
}
