import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_applications_portfolio_unit" AS ENUM('cm', 'in', 'm');
  CREATE TYPE "public"."enum_kyc_documents_captured_with" AS ENUM('camera', 'upload');
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-reopened' BEFORE 'kyc-saved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-reapply-allowed' BEFORE 'kyc-saved';
  CREATE TABLE "applications_practice_other_socials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" varchar,
  	"handle" varchar
  );
  
  CREATE TABLE "applications_rounds" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"decision" varchar,
  	"submitted_at" timestamp(3) with time zone,
  	"decided_at" timestamp(3) with time zone,
  	"note" varchar
  );
  
  ALTER TABLE "members_profile_mediums" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_members_profile_mediums";
  CREATE TYPE "public"."enum_members_profile_mediums" AS ENUM('painting', 'miniature-painting', 'drawing', 'illustration', 'calligraphy', 'printmaking', 'photography', 'sculpture', 'ceramics', 'wood', 'metal', 'glass', 'papier-mache', 'textile', 'embroidery', 'folk-tribal', 'murals', 'installation', 'performance', 'video', 'digital', 'collage', 'mixed-media', 'other');
  ALTER TABLE "members_profile_mediums" ALTER COLUMN "value" SET DATA TYPE "public"."enum_members_profile_mediums" USING "value"::"public"."enum_members_profile_mediums";
  ALTER TABLE "applications_practice_mediums" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_applications_practice_mediums";
  CREATE TYPE "public"."enum_applications_practice_mediums" AS ENUM('painting', 'miniature-painting', 'drawing', 'illustration', 'calligraphy', 'printmaking', 'photography', 'sculpture', 'ceramics', 'wood', 'metal', 'glass', 'papier-mache', 'textile', 'embroidery', 'folk-tribal', 'murals', 'installation', 'performance', 'video', 'digital', 'collage', 'mixed-media', 'other');
  ALTER TABLE "applications_practice_mediums" ALTER COLUMN "value" SET DATA TYPE "public"."enum_applications_practice_mediums" USING "value"::"public"."enum_applications_practice_mediums";
  ALTER TABLE "site_settings" ADD COLUMN "reapply_after_months" numeric DEFAULT 6;
  ALTER TABLE "site_settings" ADD COLUMN "phulhaar_social_instagram" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "phulhaar_social_facebook" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "phulhaar_social_pinterest" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_latitude" numeric;
  ALTER TABLE "members" ADD COLUMN "contact_address_longitude" numeric;
  ALTER TABLE "applications_practice_recognition" ADD COLUMN "details" varchar;
  ALTER TABLE "applications_portfolio" ADD COLUMN "width" numeric;
  ALTER TABLE "applications_portfolio" ADD COLUMN "height" numeric;
  ALTER TABLE "applications_portfolio" ADD COLUMN "depth" numeric;
  ALTER TABLE "applications_portfolio" ADD COLUMN "unit" "enum_applications_portfolio_unit";
  ALTER TABLE "applications" ADD COLUMN "identity_code_hash" varchar;
  ALTER TABLE "applications" ADD COLUMN "identity_code_issued_at" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "identity_code_expires_at" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "address_residence_latitude" numeric;
  ALTER TABLE "applications" ADD COLUMN "address_residence_longitude" numeric;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_latitude" numeric;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_longitude" numeric;
  ALTER TABLE "applications" ADD COLUMN "practice_facebook" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_recognition_none" boolean;
  ALTER TABLE "applications" ADD COLUMN "reapply_from" timestamp(3) with time zone;
  ALTER TABLE "kyc_records" ADD COLUMN "identity_code_issued_at" timestamp(3) with time zone;
  ALTER TABLE "kyc_records" ADD COLUMN "identity_code_expires_at" timestamp(3) with time zone;
  ALTER TABLE "kyc_records" ADD COLUMN "consent_notice_version" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "consent_confirmation" varchar;
  ALTER TABLE "kyc_documents" ADD COLUMN "identity_code_sealed" varchar;
  ALTER TABLE "kyc_documents" ADD COLUMN "identity_fingerprint" varchar;
  ALTER TABLE "kyc_documents" ADD COLUMN "identity_code_issued_at" timestamp(3) with time zone;
  ALTER TABLE "kyc_documents" ADD COLUMN "identity_code_expires_at" timestamp(3) with time zone;
  ALTER TABLE "kyc_documents" ADD COLUMN "captured_with" "enum_kyc_documents_captured_with";
  ALTER TABLE "applications_practice_other_socials" ADD CONSTRAINT "applications_practice_other_socials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_rounds" ADD CONSTRAINT "applications_rounds_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "applications_practice_other_socials_order_idx" ON "applications_practice_other_socials" USING btree ("_order");
  CREATE INDEX "applications_practice_other_socials_parent_id_idx" ON "applications_practice_other_socials" USING btree ("_parent_id");
  CREATE INDEX "applications_rounds_order_idx" ON "applications_rounds" USING btree ("_order");
  CREATE INDEX "applications_rounds_parent_id_idx" ON "applications_rounds" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "applications_practice_other_socials" CASCADE;
  DROP TABLE "applications_rounds" CASCADE;
  ALTER TABLE "members_profile_mediums" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_members_profile_mediums";
  CREATE TYPE "public"."enum_members_profile_mediums" AS ENUM('painting', 'drawing', 'printmaking', 'sculpture', 'photography', 'textile', 'mixed-media', 'digital', 'other');
  ALTER TABLE "members_profile_mediums" ALTER COLUMN "value" SET DATA TYPE "public"."enum_members_profile_mediums" USING "value"::"public"."enum_members_profile_mediums";
  ALTER TABLE "applications_practice_mediums" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_applications_practice_mediums";
  CREATE TYPE "public"."enum_applications_practice_mediums" AS ENUM('painting', 'drawing', 'printmaking', 'sculpture', 'photography', 'textile', 'mixed-media', 'digital', 'other');
  ALTER TABLE "applications_practice_mediums" ALTER COLUMN "value" SET DATA TYPE "public"."enum_applications_practice_mediums" USING "value"::"public"."enum_applications_practice_mediums";
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-payout-details-requested', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked', 'portal-approved', 'portal-changes-requested', 'member-email-changed', 'member-session-ended');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  ALTER TABLE "site_settings" DROP COLUMN "reapply_after_months";
  ALTER TABLE "site_settings" DROP COLUMN "phulhaar_social_instagram";
  ALTER TABLE "site_settings" DROP COLUMN "phulhaar_social_facebook";
  ALTER TABLE "site_settings" DROP COLUMN "phulhaar_social_pinterest";
  ALTER TABLE "members" DROP COLUMN "contact_address_latitude";
  ALTER TABLE "members" DROP COLUMN "contact_address_longitude";
  ALTER TABLE "applications_practice_recognition" DROP COLUMN "details";
  ALTER TABLE "applications_portfolio" DROP COLUMN "width";
  ALTER TABLE "applications_portfolio" DROP COLUMN "height";
  ALTER TABLE "applications_portfolio" DROP COLUMN "depth";
  ALTER TABLE "applications_portfolio" DROP COLUMN "unit";
  ALTER TABLE "applications" DROP COLUMN "identity_code_hash";
  ALTER TABLE "applications" DROP COLUMN "identity_code_issued_at";
  ALTER TABLE "applications" DROP COLUMN "identity_code_expires_at";
  ALTER TABLE "applications" DROP COLUMN "address_residence_latitude";
  ALTER TABLE "applications" DROP COLUMN "address_residence_longitude";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_latitude";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_longitude";
  ALTER TABLE "applications" DROP COLUMN "practice_facebook";
  ALTER TABLE "applications" DROP COLUMN "practice_recognition_none";
  ALTER TABLE "applications" DROP COLUMN "reapply_from";
  ALTER TABLE "kyc_records" DROP COLUMN "identity_code_issued_at";
  ALTER TABLE "kyc_records" DROP COLUMN "identity_code_expires_at";
  ALTER TABLE "kyc_records" DROP COLUMN "consent_notice_version";
  ALTER TABLE "kyc_records" DROP COLUMN "consent_confirmation";
  ALTER TABLE "kyc_documents" DROP COLUMN "identity_code_sealed";
  ALTER TABLE "kyc_documents" DROP COLUMN "identity_fingerprint";
  ALTER TABLE "kyc_documents" DROP COLUMN "identity_code_issued_at";
  ALTER TABLE "kyc_documents" DROP COLUMN "identity_code_expires_at";
  ALTER TABLE "kyc_documents" DROP COLUMN "captured_with";
  DROP TYPE "public"."enum_applications_portfolio_unit";
  DROP TYPE "public"."enum_kyc_documents_captured_with";`)
}
