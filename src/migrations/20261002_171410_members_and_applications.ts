import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_members_type" AS ENUM('artist', 'partner');
  CREATE TYPE "public"."enum_members_standing" AS ENUM('applicant', 'approved', 'suspended');
  CREATE TYPE "public"."enum_members_partner_category" AS ENUM('placement', 'design-technology', 'partnership');
  CREATE TYPE "public"."enum_applications_type" AS ENUM('artist', 'partner');
  CREATE TYPE "public"."enum_applications_stage" AS ENUM('draft', 'submitted', 'under-review', 'changes-requested', 'approved', 'rejected');
  CREATE TYPE "public"."enum_applications_partner_category" AS ENUM('placement', 'design-technology', 'partnership');
  CREATE TYPE "public"."enum_login_challenges_audience" AS ENUM('staff', 'member');
  CREATE TYPE "public"."enum_login_challenges_purpose" AS ENUM('signin', 'apply-artist', 'apply-partner');
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-code-requested';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-code-sent';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-code-failed';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-code-rate-limited';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-locked';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-blocked';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-created';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-signed-in';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-signed-out';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-signed-out-everywhere';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'member-id-issued';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-approved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-rejected';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'application-changes-requested';
  CREATE SEQUENCE "public"."member_id_artist_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
  CREATE SEQUENCE "public"."member_id_partner_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
  CREATE TABLE "members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"member_id" varchar,
  	"type" "enum_members_type" NOT NULL,
  	"standing" "enum_members_standing" DEFAULT 'applicant' NOT NULL,
  	"partner_category" "enum_members_partner_category",
  	"approved_at" timestamp(3) with time zone,
  	"display_name" varchar,
  	"phone" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "applications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reference" varchar NOT NULL,
  	"member_id" integer NOT NULL,
  	"type" "enum_applications_type" NOT NULL,
  	"stage" "enum_applications_stage" DEFAULT 'draft' NOT NULL,
  	"partner_category" "enum_applications_partner_category",
  	"decision_note" varchar,
  	"staff_notes" varchar,
  	"submitted_at" timestamp(3) with time zone,
  	"decided_at" timestamp(3) with time zone,
  	"decided_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"sid" varchar NOT NULL,
  	"secret_hash" varchar NOT NULL,
  	"device" varchar,
  	"last_seen_at" timestamp(3) with time zone NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"absolute_expires_at" timestamp(3) with time zone NOT NULL,
  	"revoked_at" timestamp(3) with time zone,
  	"revoked_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "security_events" ADD COLUMN "subject" varchar;
  ALTER TABLE "security_events" ADD COLUMN "actor_id" integer;
  ALTER TABLE "login_challenges" ADD COLUMN "audience" "enum_login_challenges_audience" DEFAULT 'staff' NOT NULL;
  ALTER TABLE "login_challenges" ADD COLUMN "purpose" "enum_login_challenges_purpose";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "applications_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_sessions_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "applications" ADD CONSTRAINT "applications_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "applications" ADD CONSTRAINT "applications_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "member_sessions" ADD CONSTRAINT "member_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "members_email_idx" ON "members" USING btree ("email");
  CREATE UNIQUE INDEX "members_member_id_idx" ON "members" USING btree ("member_id");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE UNIQUE INDEX "applications_reference_idx" ON "applications" USING btree ("reference");
  CREATE UNIQUE INDEX "applications_member_idx" ON "applications" USING btree ("member_id");
  CREATE INDEX "applications_stage_idx" ON "applications" USING btree ("stage");
  CREATE INDEX "applications_decided_by_idx" ON "applications" USING btree ("decided_by_id");
  CREATE INDEX "applications_updated_at_idx" ON "applications" USING btree ("updated_at");
  CREATE INDEX "applications_created_at_idx" ON "applications" USING btree ("created_at");
  CREATE INDEX "member_sessions_member_idx" ON "member_sessions" USING btree ("member_id");
  CREATE UNIQUE INDEX "member_sessions_sid_idx" ON "member_sessions" USING btree ("sid");
  CREATE INDEX "member_sessions_expires_at_idx" ON "member_sessions" USING btree ("expires_at");
  CREATE INDEX "member_sessions_revoked_at_idx" ON "member_sessions" USING btree ("revoked_at");
  CREATE INDEX "member_sessions_updated_at_idx" ON "member_sessions" USING btree ("updated_at");
  CREATE INDEX "member_sessions_created_at_idx" ON "member_sessions" USING btree ("created_at");
  ALTER TABLE "security_events" ADD CONSTRAINT "security_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_applications_fk" FOREIGN KEY ("applications_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_sessions_fk" FOREIGN KEY ("member_sessions_id") REFERENCES "public"."member_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "security_events_subject_idx" ON "security_events" USING btree ("subject");
  CREATE INDEX "security_events_actor_idx" ON "security_events" USING btree ("actor_id");
  CREATE INDEX "login_challenges_audience_idx" ON "login_challenges" USING btree ("audience");
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_applications_id_idx" ON "payload_locked_documents_rels" USING btree ("applications_id");
  CREATE INDEX "payload_locked_documents_rels_member_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("member_sessions_id");
  CREATE INDEX "payload_preferences_rels_members_id_idx" ON "payload_preferences_rels" USING btree ("members_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "applications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_sessions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "members" CASCADE;
  DROP TABLE "applications" CASCADE;
  DROP TABLE "member_sessions" CASCADE;
  ALTER TABLE "security_events" DROP CONSTRAINT "security_events_actor_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_members_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_applications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_member_sessions_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_members_fk";
  
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  DROP INDEX "security_events_subject_idx";
  DROP INDEX "security_events_actor_idx";
  DROP INDEX "login_challenges_audience_idx";
  DROP INDEX "payload_locked_documents_rels_members_id_idx";
  DROP INDEX "payload_locked_documents_rels_applications_id_idx";
  DROP INDEX "payload_locked_documents_rels_member_sessions_id_idx";
  DROP INDEX "payload_preferences_rels_members_id_idx";
  ALTER TABLE "security_events" DROP COLUMN "subject";
  ALTER TABLE "security_events" DROP COLUMN "actor_id";
  ALTER TABLE "login_challenges" DROP COLUMN "audience";
  ALTER TABLE "login_challenges" DROP COLUMN "purpose";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "members_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "applications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_sessions_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "members_id";
  DROP TYPE "public"."enum_members_type";
  DROP TYPE "public"."enum_members_standing";
  DROP TYPE "public"."enum_members_partner_category";
  DROP TYPE "public"."enum_applications_type";
  DROP TYPE "public"."enum_applications_stage";
  DROP TYPE "public"."enum_applications_partner_category";
  DROP TYPE "public"."enum_login_challenges_audience";
  DROP TYPE "public"."enum_login_challenges_purpose";
  DROP SEQUENCE "public"."member_id_artist_seq";
  DROP SEQUENCE "public"."member_id_partner_seq";`)
}
