import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_applications_curator_areas" AS ENUM('contemporary', 'modern', 'miniature-traditional', 'craft-design', 'sculpture-objects', 'interiors-hospitality', 'private-collections', 'events-sets', 'other');
  CREATE TYPE "public"."enum_applications_curator_files_kind" AS ENUM('portfolio', 'cv');
  CREATE TYPE "public"."enum_applications_curator_emails_kind" AS ENUM('talk', 'decline');
  CREATE TYPE "public"."enum_applications_curator_years" AS ENUM('under-2', '2-5', '6-10', 'over-10');
  CREATE TYPE "public"."enum_applications_curator_wants" AS ENUM('phulhaar', 'clients', 'both');
  CREATE TYPE "public"."enum_applications_curator_status" AS ENUM('new', 'talking', 'working', 'on-file', 'not-this-time');
  ALTER TYPE "public"."enum_applications_type" ADD VALUE 'curator';
  CREATE TABLE "applications_curator_areas" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_applications_curator_areas",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "applications_curator_projects" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"year" varchar,
  	"place" varchar,
  	"role" varchar,
  	"link" varchar
  );
  
  CREATE TABLE "applications_curator_files" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_applications_curator_files_kind" NOT NULL,
  	"filename" varchar NOT NULL,
  	"content_type" varchar NOT NULL,
  	"size" numeric,
  	"storage_key" varchar NOT NULL,
  	"key_id" varchar NOT NULL,
  	"wrapped_key" varchar NOT NULL
  );
  
  CREATE TABLE "applications_team_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"by" varchar,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "applications_curator_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_applications_curator_emails_kind",
  	"subject" varchar,
  	"body" varchar,
  	"by" varchar,
  	"at" timestamp(3) with time zone
  );
  
  ALTER TABLE "applications" ALTER COLUMN "member_id" DROP NOT NULL;
  ALTER TABLE "applications" ADD COLUMN "curator_full_name" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_email" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_phone" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_country" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_city" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_role" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_years" "enum_applications_curator_years";
  ALTER TABLE "applications" ADD COLUMN "curator_languages" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_portfolio_link" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_wants" "enum_applications_curator_wants";
  ALTER TABLE "applications" ADD COLUMN "curator_idea" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_fee" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_start" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_declarations_consent_processing" boolean;
  ALTER TABLE "applications" ADD COLUMN "curator_declarations_adult" boolean;
  ALTER TABLE "applications" ADD COLUMN "curator_declarations_accurate" boolean;
  ALTER TABLE "applications" ADD COLUMN "curator_declarations_keep_on_file" boolean;
  ALTER TABLE "applications" ADD COLUMN "curator_declarations_privacy_notice_version" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_upload_token_hash" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_upload_expires_at" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "curator_upload_folder" varchar;
  ALTER TABLE "applications" ADD COLUMN "curator_upload_files" jsonb;
  ALTER TABLE "applications" ADD COLUMN "curator_status" "enum_applications_curator_status";
  ALTER TABLE "applications" ADD COLUMN "curator_project" varchar;
  ALTER TABLE "applications_curator_areas" ADD CONSTRAINT "applications_curator_areas_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_curator_projects" ADD CONSTRAINT "applications_curator_projects_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_curator_files" ADD CONSTRAINT "applications_curator_files_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_team_notes" ADD CONSTRAINT "applications_team_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "applications_curator_emails" ADD CONSTRAINT "applications_curator_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "applications_curator_areas_order_idx" ON "applications_curator_areas" USING btree ("order");
  CREATE INDEX "applications_curator_areas_parent_idx" ON "applications_curator_areas" USING btree ("parent_id");
  CREATE INDEX "applications_curator_projects_order_idx" ON "applications_curator_projects" USING btree ("_order");
  CREATE INDEX "applications_curator_projects_parent_id_idx" ON "applications_curator_projects" USING btree ("_parent_id");
  CREATE INDEX "applications_curator_files_order_idx" ON "applications_curator_files" USING btree ("_order");
  CREATE INDEX "applications_curator_files_parent_id_idx" ON "applications_curator_files" USING btree ("_parent_id");
  CREATE INDEX "applications_team_notes_order_idx" ON "applications_team_notes" USING btree ("_order");
  CREATE INDEX "applications_team_notes_parent_id_idx" ON "applications_team_notes" USING btree ("_parent_id");
  CREATE INDEX "applications_curator_emails_order_idx" ON "applications_curator_emails" USING btree ("_order");
  CREATE INDEX "applications_curator_emails_parent_id_idx" ON "applications_curator_emails" USING btree ("_parent_id");
  CREATE INDEX "applications_curator_curator_email_idx" ON "applications" USING btree ("curator_email");
  CREATE INDEX "applications_curator_status_idx" ON "applications" USING btree ("curator_status");
  ALTER TABLE "applications_curator_areas" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."applications_curator_areas" TO pjk_app_access USING (true) WITH CHECK (true);
  ALTER TABLE "applications_curator_projects" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."applications_curator_projects" TO pjk_app_access USING (true) WITH CHECK (true);
  ALTER TABLE "applications_curator_files" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."applications_curator_files" TO pjk_app_access USING (true) WITH CHECK (true);
  ALTER TABLE "applications_team_notes" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."applications_team_notes" TO pjk_app_access USING (true) WITH CHECK (true);
  ALTER TABLE "applications_curator_emails" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."applications_curator_emails" TO pjk_app_access USING (true) WITH CHECK (true);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Guest curator applications have no place in the older type, and no member to belong to
  await db.execute(sql`
   DELETE FROM "applications" WHERE "type" = 'curator';
   ALTER TABLE "applications_curator_areas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications_curator_projects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications_curator_files" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications_team_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications_curator_emails" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "applications_curator_areas" CASCADE;
  DROP TABLE "applications_curator_projects" CASCADE;
  DROP TABLE "applications_curator_files" CASCADE;
  DROP TABLE "applications_team_notes" CASCADE;
  DROP TABLE "applications_curator_emails" CASCADE;
  ALTER TABLE "applications" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_applications_type";
  CREATE TYPE "public"."enum_applications_type" AS ENUM('artist', 'partner');
  ALTER TABLE "applications" ALTER COLUMN "type" SET DATA TYPE "public"."enum_applications_type" USING "type"::"public"."enum_applications_type";
  DROP INDEX "applications_curator_curator_email_idx";
  DROP INDEX "applications_curator_status_idx";
  ALTER TABLE "applications" ALTER COLUMN "member_id" SET NOT NULL;
  ALTER TABLE "applications" DROP COLUMN "curator_full_name";
  ALTER TABLE "applications" DROP COLUMN "curator_email";
  ALTER TABLE "applications" DROP COLUMN "curator_phone";
  ALTER TABLE "applications" DROP COLUMN "curator_country";
  ALTER TABLE "applications" DROP COLUMN "curator_city";
  ALTER TABLE "applications" DROP COLUMN "curator_role";
  ALTER TABLE "applications" DROP COLUMN "curator_years";
  ALTER TABLE "applications" DROP COLUMN "curator_languages";
  ALTER TABLE "applications" DROP COLUMN "curator_portfolio_link";
  ALTER TABLE "applications" DROP COLUMN "curator_wants";
  ALTER TABLE "applications" DROP COLUMN "curator_idea";
  ALTER TABLE "applications" DROP COLUMN "curator_fee";
  ALTER TABLE "applications" DROP COLUMN "curator_start";
  ALTER TABLE "applications" DROP COLUMN "curator_declarations_consent_processing";
  ALTER TABLE "applications" DROP COLUMN "curator_declarations_adult";
  ALTER TABLE "applications" DROP COLUMN "curator_declarations_accurate";
  ALTER TABLE "applications" DROP COLUMN "curator_declarations_keep_on_file";
  ALTER TABLE "applications" DROP COLUMN "curator_declarations_privacy_notice_version";
  ALTER TABLE "applications" DROP COLUMN "curator_upload_token_hash";
  ALTER TABLE "applications" DROP COLUMN "curator_upload_expires_at";
  ALTER TABLE "applications" DROP COLUMN "curator_upload_folder";
  ALTER TABLE "applications" DROP COLUMN "curator_upload_files";
  ALTER TABLE "applications" DROP COLUMN "curator_status";
  ALTER TABLE "applications" DROP COLUMN "curator_project";
  DROP TYPE "public"."enum_applications_curator_areas";
  DROP TYPE "public"."enum_applications_curator_files_kind";
  DROP TYPE "public"."enum_applications_curator_emails_kind";
  DROP TYPE "public"."enum_applications_curator_years";
  DROP TYPE "public"."enum_applications_curator_wants";
  DROP TYPE "public"."enum_applications_curator_status";`)
}
