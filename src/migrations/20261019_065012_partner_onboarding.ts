import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" ADD COLUMN "partner_agreement_title" varchar DEFAULT 'Partner/Trade Program agreement';
  ALTER TABLE "site_settings" ADD COLUMN "partner_agreement_version" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "partner_agreement_text" jsonb;
  ALTER TABLE "applications" ADD COLUMN "partner_declarations_consent_processing" boolean;
  ALTER TABLE "applications" ADD COLUMN "partner_declarations_privacy_notice_version" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_declarations_agreement_version" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_declarations_agreed_at" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "partner_declarations_agreement_confirmation" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_declarations_agreement_digest" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP COLUMN "partner_agreement_title";
  ALTER TABLE "site_settings" DROP COLUMN "partner_agreement_version";
  ALTER TABLE "site_settings" DROP COLUMN "partner_agreement_text";
  ALTER TABLE "applications" DROP COLUMN "partner_declarations_consent_processing";
  ALTER TABLE "applications" DROP COLUMN "partner_declarations_privacy_notice_version";
  ALTER TABLE "applications" DROP COLUMN "partner_declarations_agreement_version";
  ALTER TABLE "applications" DROP COLUMN "partner_declarations_agreed_at";
  ALTER TABLE "applications" DROP COLUMN "partner_declarations_agreement_confirmation";
  ALTER TABLE "applications" DROP COLUMN "partner_declarations_agreement_digest";`)
}
