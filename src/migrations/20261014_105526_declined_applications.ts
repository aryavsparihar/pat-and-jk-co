import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_applications_stage" ADD VALUE 'withdrawn';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-under-review' BEFORE 'kyc-saved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-withdrawn' BEFORE 'kyc-saved';
  DROP INDEX "member_type_idx";
  ALTER TABLE "site_settings" ADD COLUMN "reapply_after_days" numeric DEFAULT 90;
  ALTER TABLE "applications" ADD COLUMN "withdrawn_at" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "previous_application_id" integer;
  ALTER TABLE "applications" ADD COLUMN "current_slot" varchar;
  ALTER TABLE "applications" ADD CONSTRAINT "applications_previous_application_id_applications_id_fk" FOREIGN KEY ("previous_application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "applications_previous_application_idx" ON "applications" USING btree ("previous_application_id");
  CREATE UNIQUE INDEX "applications_current_slot_idx" ON "applications" USING btree ("current_slot");
  CREATE INDEX "member_type_idx" ON "applications" USING btree ("member_id","type");`)

  await fillEmpty(db)
}

/**
 * The data, filling only what is empty, so running it twice changes nothing. A person's newest
 * application of a kind is their current one (until now there was only ever one), unless another
 * already holds the place. Exported for the test that runs it over an application declined the
 * old way.
 */
export const fillEmpty = async (db: MigrateUpArgs['db']): Promise<void> => {
  await db.execute(sql`
    UPDATE "applications" a SET "current_slot" = a."member_id" || ':' || a."type"
    WHERE a."current_slot" IS NULL AND a."member_id" IS NOT NULL
      AND a."id" = (
        SELECT b."id" FROM "applications" b
        WHERE b."member_id" = a."member_id" AND b."type" = a."type"
        ORDER BY b."created_at" DESC, b."id" DESC LIMIT 1)
      AND NOT EXISTS (
        SELECT 1 FROM "applications" c WHERE c."current_slot" = a."member_id" || ':' || a."type");`)
  // Applications declined before the date to apply again was kept: from the decision (or, if
  // even that is missing, the last change), 90 days on, the wait Site settings now starts with
  await db.execute(sql`
    UPDATE "applications"
    SET "reapply_from" = COALESCE("decided_at", "updated_at") + interval '90 days'
    WHERE "stage" = 'rejected' AND "reapply_from" IS NULL;`)
  await db.execute(sql`
    UPDATE "site_settings" SET "reapply_after_days" = 90 WHERE "reapply_after_days" IS NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "applications" DROP CONSTRAINT "applications_previous_application_id_applications_id_fk";
  
  ALTER TABLE "applications" ALTER COLUMN "stage" SET DATA TYPE text;
  ALTER TABLE "applications" ALTER COLUMN "stage" SET DEFAULT 'draft'::text;
  DROP TYPE "public"."enum_applications_stage";
  CREATE TYPE "public"."enum_applications_stage" AS ENUM('draft', 'submitted', 'under-review', 'changes-requested', 'approved', 'rejected');
  ALTER TABLE "applications" ALTER COLUMN "stage" SET DEFAULT 'draft'::"public"."enum_applications_stage";
  ALTER TABLE "applications" ALTER COLUMN "stage" SET DATA TYPE "public"."enum_applications_stage" USING "stage"::"public"."enum_applications_stage";
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'staff-signed-in', 'staff-sign-in-failed', 'staff-locked', 'access-refused', 'rate-limited', 'alert-sent', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-confirmed', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'application-reopened', 'application-reapply-allowed', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-payout-details-requested', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  DROP INDEX "applications_previous_application_idx";
  DROP INDEX "applications_current_slot_idx";
  DROP INDEX "member_type_idx";
  CREATE UNIQUE INDEX "member_type_idx" ON "applications" USING btree ("member_id","type");
  ALTER TABLE "site_settings" DROP COLUMN "reapply_after_days";
  ALTER TABLE "applications" DROP COLUMN "withdrawn_at";
  ALTER TABLE "applications" DROP COLUMN "previous_application_id";
  ALTER TABLE "applications" DROP COLUMN "current_slot";`)
}
