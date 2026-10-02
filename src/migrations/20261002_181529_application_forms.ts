import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_applications_practice_mediums" AS ENUM('painting', 'drawing', 'printmaking', 'sculpture', 'photography', 'textile', 'mixed-media', 'digital', 'other');
  CREATE TYPE "public"."enum_applications_practice_recognition_kind" AS ENUM('exhibition', 'award', 'residency', 'publication');
  CREATE TYPE "public"."enum_applications_completed_steps" AS ENUM('about', 'address', 'practice', 'portfolio', 'review');
  CREATE TYPE "public"."enum_applications_about_language" AS ENUM('English', 'Hindi', 'Dogri', 'Urdu', 'Punjabi', 'Kashmiri', 'Other');
  CREATE TYPE "public"."enum_applications_practice_price_range" AS ENUM('under-25k', '25k-1l', '1l-5l', 'over-5l', 'not-sure');
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-submitted' BEFORE 'application-approved';
  CREATE TABLE "applications_practice_mediums" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_applications_practice_mediums",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "applications_practice_recognition" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_applications_practice_recognition_kind",
  	"title" varchar,
  	"venue" varchar,
  	"year" numeric
  );
  
  CREATE TABLE "applications_portfolio" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"year" numeric,
  	"medium" varchar,
  	"width_cm" numeric,
  	"height_cm" numeric,
  	"depth_cm" numeric
  );
  
  CREATE TABLE "applications_completed_steps" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_applications_completed_steps",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "portfolio_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_display_url" varchar,
  	"sizes_display_width" numeric,
  	"sizes_display_height" numeric,
  	"sizes_display_mime_type" varchar,
  	"sizes_display_filesize" numeric,
  	"sizes_display_filename" varchar
  );
  
  ALTER TABLE "applications" ADD COLUMN "about_legal_name" varchar;
  ALTER TABLE "applications" ADD COLUMN "about_display_name" varchar;
  ALTER TABLE "applications" ADD COLUMN "about_date_of_birth" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "about_phone" varchar;
  ALTER TABLE "applications" ADD COLUMN "about_language" "enum_applications_about_language";
  ALTER TABLE "applications" ADD COLUMN "address_residence_line1" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_residence_line2" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_residence_landmark" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_residence_city" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_residence_district" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_residence_state" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_residence_postal_code" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_residence_country" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_same" boolean;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_line1" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_line2" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_landmark" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_city" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_district" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_state" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_postal_code" varchar;
  ALTER TABLE "applications" ADD COLUMN "address_correspondence_country" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_medium_other" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_styles_themes" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_years_practising" numeric;
  ALTER TABLE "applications" ADD COLUMN "practice_training" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_bio" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_statement" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_website" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_instagram" varchar;
  ALTER TABLE "applications" ADD COLUMN "practice_price_range" "enum_applications_practice_price_range";
  ALTER TABLE "applications" ADD COLUMN "declarations_original_work" boolean;
  ALTER TABLE "applications" ADD COLUMN "declarations_accurate" boolean;
  ALTER TABLE "applications" ADD COLUMN "declarations_consent_processing" boolean;
  ALTER TABLE "applications" ADD COLUMN "declarations_consented_at" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "declarations_privacy_notice_version" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_sub_type" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_full_name" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_role" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_organisation" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_phone" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_city" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_state" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_website" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_gstin" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_interest" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_message" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "portfolio_images_id" integer;
  ALTER TABLE "applications_practice_mediums" ADD CONSTRAINT "applications_practice_mediums_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_practice_recognition" ADD CONSTRAINT "applications_practice_recognition_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_portfolio" ADD CONSTRAINT "applications_portfolio_image_id_portfolio_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."portfolio_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "applications_portfolio" ADD CONSTRAINT "applications_portfolio_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_completed_steps" ADD CONSTRAINT "applications_completed_steps_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "portfolio_images" ADD CONSTRAINT "portfolio_images_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "applications_practice_mediums_order_idx" ON "applications_practice_mediums" USING btree ("order");
  CREATE INDEX "applications_practice_mediums_parent_idx" ON "applications_practice_mediums" USING btree ("parent_id");
  CREATE INDEX "applications_practice_recognition_order_idx" ON "applications_practice_recognition" USING btree ("_order");
  CREATE INDEX "applications_practice_recognition_parent_id_idx" ON "applications_practice_recognition" USING btree ("_parent_id");
  CREATE INDEX "applications_portfolio_order_idx" ON "applications_portfolio" USING btree ("_order");
  CREATE INDEX "applications_portfolio_parent_id_idx" ON "applications_portfolio" USING btree ("_parent_id");
  CREATE INDEX "applications_portfolio_image_idx" ON "applications_portfolio" USING btree ("image_id");
  CREATE INDEX "applications_completed_steps_order_idx" ON "applications_completed_steps" USING btree ("order");
  CREATE INDEX "applications_completed_steps_parent_idx" ON "applications_completed_steps" USING btree ("parent_id");
  CREATE INDEX "portfolio_images_owner_idx" ON "portfolio_images" USING btree ("owner_id");
  CREATE INDEX "portfolio_images_updated_at_idx" ON "portfolio_images" USING btree ("updated_at");
  CREATE INDEX "portfolio_images_created_at_idx" ON "portfolio_images" USING btree ("created_at");
  CREATE UNIQUE INDEX "portfolio_images_filename_idx" ON "portfolio_images" USING btree ("filename");
  CREATE INDEX "portfolio_images_sizes_thumbnail_sizes_thumbnail_filenam_idx" ON "portfolio_images" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "portfolio_images_sizes_display_sizes_display_filename_idx" ON "portfolio_images" USING btree ("sizes_display_filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_portfolio_images_fk" FOREIGN KEY ("portfolio_images_id") REFERENCES "public"."portfolio_images"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_portfolio_images_id_idx" ON "payload_locked_documents_rels" USING btree ("portfolio_images_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "applications_practice_mediums" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications_practice_recognition" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications_portfolio" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications_completed_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "portfolio_images" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "applications_practice_mediums" CASCADE;
  DROP TABLE "applications_practice_recognition" CASCADE;
  DROP TABLE "applications_portfolio" CASCADE;
  DROP TABLE "applications_completed_steps" CASCADE;
  DROP TABLE "portfolio_images" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_portfolio_images_fk";
  
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-approved', 'application-rejected', 'application-changes-requested');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  DROP INDEX "payload_locked_documents_rels_portfolio_images_id_idx";
  ALTER TABLE "applications" DROP COLUMN "about_legal_name";
  ALTER TABLE "applications" DROP COLUMN "about_display_name";
  ALTER TABLE "applications" DROP COLUMN "about_date_of_birth";
  ALTER TABLE "applications" DROP COLUMN "about_phone";
  ALTER TABLE "applications" DROP COLUMN "about_language";
  ALTER TABLE "applications" DROP COLUMN "address_residence_line1";
  ALTER TABLE "applications" DROP COLUMN "address_residence_line2";
  ALTER TABLE "applications" DROP COLUMN "address_residence_landmark";
  ALTER TABLE "applications" DROP COLUMN "address_residence_city";
  ALTER TABLE "applications" DROP COLUMN "address_residence_district";
  ALTER TABLE "applications" DROP COLUMN "address_residence_state";
  ALTER TABLE "applications" DROP COLUMN "address_residence_postal_code";
  ALTER TABLE "applications" DROP COLUMN "address_residence_country";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_same";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_line1";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_line2";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_landmark";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_city";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_district";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_state";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_postal_code";
  ALTER TABLE "applications" DROP COLUMN "address_correspondence_country";
  ALTER TABLE "applications" DROP COLUMN "practice_medium_other";
  ALTER TABLE "applications" DROP COLUMN "practice_styles_themes";
  ALTER TABLE "applications" DROP COLUMN "practice_years_practising";
  ALTER TABLE "applications" DROP COLUMN "practice_training";
  ALTER TABLE "applications" DROP COLUMN "practice_bio";
  ALTER TABLE "applications" DROP COLUMN "practice_statement";
  ALTER TABLE "applications" DROP COLUMN "practice_website";
  ALTER TABLE "applications" DROP COLUMN "practice_instagram";
  ALTER TABLE "applications" DROP COLUMN "practice_price_range";
  ALTER TABLE "applications" DROP COLUMN "declarations_original_work";
  ALTER TABLE "applications" DROP COLUMN "declarations_accurate";
  ALTER TABLE "applications" DROP COLUMN "declarations_consent_processing";
  ALTER TABLE "applications" DROP COLUMN "declarations_consented_at";
  ALTER TABLE "applications" DROP COLUMN "declarations_privacy_notice_version";
  ALTER TABLE "applications" DROP COLUMN "partner_sub_type";
  ALTER TABLE "applications" DROP COLUMN "partner_full_name";
  ALTER TABLE "applications" DROP COLUMN "partner_role";
  ALTER TABLE "applications" DROP COLUMN "partner_organisation";
  ALTER TABLE "applications" DROP COLUMN "partner_phone";
  ALTER TABLE "applications" DROP COLUMN "partner_city";
  ALTER TABLE "applications" DROP COLUMN "partner_state";
  ALTER TABLE "applications" DROP COLUMN "partner_website";
  ALTER TABLE "applications" DROP COLUMN "partner_gstin";
  ALTER TABLE "applications" DROP COLUMN "partner_interest";
  ALTER TABLE "applications" DROP COLUMN "partner_message";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "portfolio_images_id";
  DROP TYPE "public"."enum_applications_practice_mediums";
  DROP TYPE "public"."enum_applications_practice_recognition_kind";
  DROP TYPE "public"."enum_applications_completed_steps";
  DROP TYPE "public"."enum_applications_about_language";
  DROP TYPE "public"."enum_applications_practice_price_range";`)
}
