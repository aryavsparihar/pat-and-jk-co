import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_members_profile_mediums" AS ENUM('painting', 'drawing', 'printmaking', 'sculpture', 'photography', 'textile', 'mixed-media', 'digital', 'other');
  CREATE TYPE "public"."enum_members_profile_review_state" AS ENUM('none', 'pending', 'approved', 'changes-requested');
  CREATE TYPE "public"."enum_artworks_review_state" AS ENUM('none', 'pending', 'approved', 'changes-requested');
  CREATE TYPE "public"."enum_artworks_availability" AS ENUM('available', 'reserved', 'sold', 'not-available');
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'portal-approved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'portal-changes-requested';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-email-changed';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-session-ended';
  ALTER TYPE "public"."enum_login_challenges_purpose" ADD VALUE 'email-change';
  CREATE TABLE "members_profile_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar
  );
  
  CREATE TABLE "members_profile_mediums" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_members_profile_mediums",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "members_profile_exhibitions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"venue" varchar,
  	"year" numeric
  );
  
  CREATE TABLE "artworks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"owner_id" integer NOT NULL,
  	"venture_id" integer,
  	"review_state" "enum_artworks_review_state" DEFAULT 'none',
  	"review_note" varchar,
  	"review_submitted_at" timestamp(3) with time zone,
  	"review_reviewed_at" timestamp(3) with time zone,
  	"review_reviewed_by_id" integer,
  	"title" varchar NOT NULL,
  	"year" numeric,
  	"medium" varchar,
  	"surface" varchar,
  	"width_cm" numeric,
  	"height_cm" numeric,
  	"depth_cm" numeric,
  	"edition" varchar,
  	"for_sale" boolean DEFAULT true,
  	"price_inr" numeric,
  	"availability" "enum_artworks_availability" DEFAULT 'available',
  	"description" varchar,
  	"sort_order" numeric DEFAULT 0,
  	"archived" boolean DEFAULT false,
  	"published" jsonb,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "artworks_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"portfolio_images_id" integer
  );
  
  ALTER TABLE "members" ADD COLUMN "contact_address_line1" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_line2" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_landmark" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_city" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_district" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_state" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_postal_code" varchar;
  ALTER TABLE "members" ADD COLUMN "contact_address_country" varchar;
  ALTER TABLE "members" ADD COLUMN "profile_review_state" "enum_members_profile_review_state" DEFAULT 'none';
  ALTER TABLE "members" ADD COLUMN "profile_review_note" varchar;
  ALTER TABLE "members" ADD COLUMN "profile_review_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "profile_review_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "profile_review_reviewed_by_id" integer;
  ALTER TABLE "members" ADD COLUMN "profile_display_name" varchar;
  ALTER TABLE "members" ADD COLUMN "profile_bio" varchar;
  ALTER TABLE "members" ADD COLUMN "profile_statement" varchar;
  ALTER TABLE "members" ADD COLUMN "profile_portrait_id" integer;
  ALTER TABLE "members" ADD COLUMN "public_profile" jsonb;
  ALTER TABLE "members" ADD COLUMN "public_profile_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "email_change_pending_email" varchar;
  ALTER TABLE "members" ADD COLUMN "email_change_challenge_id" numeric;
  ALTER TABLE "members" ADD COLUMN "email_change_requested_at" timestamp(3) with time zone;
  ALTER TABLE "portfolio_images" ADD COLUMN "public" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "artworks_id" integer;
  ALTER TABLE "members_profile_links" ADD CONSTRAINT "members_profile_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_profile_mediums" ADD CONSTRAINT "members_profile_mediums_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_profile_exhibitions" ADD CONSTRAINT "members_profile_exhibitions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "artworks" ADD CONSTRAINT "artworks_owner_id_members_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "artworks" ADD CONSTRAINT "artworks_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "artworks" ADD CONSTRAINT "artworks_review_reviewed_by_id_users_id_fk" FOREIGN KEY ("review_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "artworks_rels" ADD CONSTRAINT "artworks_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "artworks_rels" ADD CONSTRAINT "artworks_rels_portfolio_images_fk" FOREIGN KEY ("portfolio_images_id") REFERENCES "public"."portfolio_images"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "members_profile_links_order_idx" ON "members_profile_links" USING btree ("_order");
  CREATE INDEX "members_profile_links_parent_id_idx" ON "members_profile_links" USING btree ("_parent_id");
  CREATE INDEX "members_profile_mediums_order_idx" ON "members_profile_mediums" USING btree ("order");
  CREATE INDEX "members_profile_mediums_parent_idx" ON "members_profile_mediums" USING btree ("parent_id");
  CREATE INDEX "members_profile_exhibitions_order_idx" ON "members_profile_exhibitions" USING btree ("_order");
  CREATE INDEX "members_profile_exhibitions_parent_id_idx" ON "members_profile_exhibitions" USING btree ("_parent_id");
  CREATE INDEX "artworks_owner_idx" ON "artworks" USING btree ("owner_id");
  CREATE INDEX "artworks_venture_idx" ON "artworks" USING btree ("venture_id");
  CREATE INDEX "artworks_review_review_state_idx" ON "artworks" USING btree ("review_state");
  CREATE INDEX "artworks_review_review_reviewed_by_idx" ON "artworks" USING btree ("review_reviewed_by_id");
  CREATE INDEX "artworks_sort_order_idx" ON "artworks" USING btree ("sort_order");
  CREATE INDEX "artworks_archived_idx" ON "artworks" USING btree ("archived");
  CREATE INDEX "artworks_updated_at_idx" ON "artworks" USING btree ("updated_at");
  CREATE INDEX "artworks_created_at_idx" ON "artworks" USING btree ("created_at");
  CREATE INDEX "artworks_rels_order_idx" ON "artworks_rels" USING btree ("order");
  CREATE INDEX "artworks_rels_parent_idx" ON "artworks_rels" USING btree ("parent_id");
  CREATE INDEX "artworks_rels_path_idx" ON "artworks_rels" USING btree ("path");
  CREATE INDEX "artworks_rels_portfolio_images_id_idx" ON "artworks_rels" USING btree ("portfolio_images_id");
  ALTER TABLE "members" ADD CONSTRAINT "members_profile_review_reviewed_by_id_users_id_fk" FOREIGN KEY ("profile_review_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "members" ADD CONSTRAINT "members_profile_portrait_id_portfolio_images_id_fk" FOREIGN KEY ("profile_portrait_id") REFERENCES "public"."portfolio_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_artworks_fk" FOREIGN KEY ("artworks_id") REFERENCES "public"."artworks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "members_profile_review_profile_review_state_idx" ON "members" USING btree ("profile_review_state");
  CREATE INDEX "members_profile_review_profile_review_reviewed_by_idx" ON "members" USING btree ("profile_review_reviewed_by_id");
  CREATE INDEX "members_profile_profile_portrait_idx" ON "members" USING btree ("profile_portrait_id");
  CREATE INDEX "portfolio_images_public_idx" ON "portfolio_images" USING btree ("public");
  CREATE INDEX "payload_locked_documents_rels_artworks_id_idx" ON "payload_locked_documents_rels" USING btree ("artworks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "members_profile_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_profile_mediums" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_profile_exhibitions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "artworks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "artworks_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "members_profile_links" CASCADE;
  DROP TABLE "members_profile_mediums" CASCADE;
  DROP TABLE "members_profile_exhibitions" CASCADE;
  DROP TABLE "artworks" CASCADE;
  DROP TABLE "artworks_rels" CASCADE;
  ALTER TABLE "members" DROP CONSTRAINT "members_profile_review_reviewed_by_id_users_id_fk";
  
  ALTER TABLE "members" DROP CONSTRAINT "members_profile_portrait_id_portfolio_images_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_artworks_fk";
  
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested', 'kyc-saved', 'kyc-revealed', 'kyc-document-opened', 'kyc-bank-change-requested', 'kyc-bank-change-cancelled', 'kyc-bank-change-approved', 'kyc-consent-withdrawn', 'kyc-purged', 'data-request', 'kyc-legal-hold-changed', 'kyc-aadhaar-checked');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  ALTER TABLE "login_challenges" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_login_challenges_purpose";
  CREATE TYPE "public"."enum_login_challenges_purpose" AS ENUM('signin', 'apply-artist', 'apply-partner', 'step-up');
  ALTER TABLE "login_challenges" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_login_challenges_purpose" USING "purpose"::"public"."enum_login_challenges_purpose";
  DROP INDEX "members_profile_review_profile_review_state_idx";
  DROP INDEX "members_profile_review_profile_review_reviewed_by_idx";
  DROP INDEX "members_profile_profile_portrait_idx";
  DROP INDEX "portfolio_images_public_idx";
  DROP INDEX "payload_locked_documents_rels_artworks_id_idx";
  ALTER TABLE "members" DROP COLUMN "contact_address_line1";
  ALTER TABLE "members" DROP COLUMN "contact_address_line2";
  ALTER TABLE "members" DROP COLUMN "contact_address_landmark";
  ALTER TABLE "members" DROP COLUMN "contact_address_city";
  ALTER TABLE "members" DROP COLUMN "contact_address_district";
  ALTER TABLE "members" DROP COLUMN "contact_address_state";
  ALTER TABLE "members" DROP COLUMN "contact_address_postal_code";
  ALTER TABLE "members" DROP COLUMN "contact_address_country";
  ALTER TABLE "members" DROP COLUMN "profile_review_state";
  ALTER TABLE "members" DROP COLUMN "profile_review_note";
  ALTER TABLE "members" DROP COLUMN "profile_review_submitted_at";
  ALTER TABLE "members" DROP COLUMN "profile_review_reviewed_at";
  ALTER TABLE "members" DROP COLUMN "profile_review_reviewed_by_id";
  ALTER TABLE "members" DROP COLUMN "profile_display_name";
  ALTER TABLE "members" DROP COLUMN "profile_bio";
  ALTER TABLE "members" DROP COLUMN "profile_statement";
  ALTER TABLE "members" DROP COLUMN "profile_portrait_id";
  ALTER TABLE "members" DROP COLUMN "public_profile";
  ALTER TABLE "members" DROP COLUMN "public_profile_at";
  ALTER TABLE "members" DROP COLUMN "email_change_pending_email";
  ALTER TABLE "members" DROP COLUMN "email_change_challenge_id";
  ALTER TABLE "members" DROP COLUMN "email_change_requested_at";
  ALTER TABLE "portfolio_images" DROP COLUMN "public";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "artworks_id";
  DROP TYPE "public"."enum_members_profile_mediums";
  DROP TYPE "public"."enum_members_profile_review_state";
  DROP TYPE "public"."enum_artworks_review_state";
  DROP TYPE "public"."enum_artworks_availability";`)
}
