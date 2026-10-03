import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_kyc_records_id_type" AS ENUM('pan', 'aadhaar');
  CREATE TYPE "public"."enum_kyc_records_account_type" AS ENUM('savings', 'current');
  CREATE TYPE "public"."enum_kyc_records_verification_status" AS ENUM('unverified', 'verified', 'failed');
  CREATE TYPE "public"."enum_kyc_records_verification_method" AS ENUM('manual', 'penny-drop', 'pan-service');
  CREATE TYPE "public"."enum_kyc_records_pending_bank_pending_account_type" AS ENUM('savings', 'current');
  CREATE TYPE "public"."enum_kyc_documents_kind" AS ENUM('pan-card', 'masked-aadhaar', 'address-proof', 'bank-proof');
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'kyc-reviewer';
  ALTER TYPE "public"."enum_applications_completed_steps" ADD VALUE 'kyc' BEFORE 'review';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-saved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-revealed';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-document-opened';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-bank-change-requested';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-bank-change-cancelled';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-bank-change-approved';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-consent-withdrawn';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'kyc-purged';
  ALTER TYPE "public"."enum_security_events_event" ADD VALUE 'data-request';
  ALTER TYPE "public"."enum_login_challenges_purpose" ADD VALUE 'step-up';
  CREATE TABLE "kyc_records" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"reference" varchar,
  	"key_id" varchar,
  	"wrapped_key" varchar,
  	"id_type" "enum_kyc_records_id_type",
  	"pan_sealed" varchar,
  	"pan_name_sealed" varchar,
  	"aadhaar_last4_sealed" varchar,
  	"id_masked" varchar,
  	"address_on_id_matches" boolean,
  	"account_number_sealed" varchar,
  	"ifsc_sealed" varchar,
  	"holder_name_sealed" varchar,
  	"branch_name_sealed" varchar,
  	"account_masked" varchar,
  	"ifsc_masked" varchar,
  	"bank_name" varchar,
  	"account_type" "enum_kyc_records_account_type",
  	"name_mismatch" boolean,
  	"pan_index" varchar,
  	"account_index" varchar,
  	"duplicates" varchar,
  	"verification_status" "enum_kyc_records_verification_status" DEFAULT 'unverified',
  	"verification_method" "enum_kyc_records_verification_method",
  	"verification_verified_at" timestamp(3) with time zone,
  	"verification_verified_by_id" integer,
  	"verification_provider_reference" varchar,
  	"pending_bank_pending_account_number_sealed" varchar,
  	"pending_bank_pending_ifsc_sealed" varchar,
  	"pending_bank_pending_holder_name_sealed" varchar,
  	"pending_bank_pending_branch_name_sealed" varchar,
  	"pending_bank_pending_account_masked" varchar,
  	"pending_bank_pending_ifsc_masked" varchar,
  	"pending_bank_pending_bank_name" varchar,
  	"pending_bank_pending_account_type" "enum_kyc_records_pending_bank_pending_account_type",
  	"pending_bank_requested_at" timestamp(3) with time zone,
  	"pending_bank_cancel_token_hash" varchar,
  	"consented_at" timestamp(3) with time zone,
  	"consent_withdrawn_at" timestamp(3) with time zone,
  	"legal_hold_until" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "kyc_records_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"kyc_documents_id" integer
  );
  
  CREATE TABLE "kyc_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"kind" "enum_kyc_documents_kind" NOT NULL,
  	"content_type" varchar NOT NULL,
  	"size" numeric,
  	"storage_key" varchar NOT NULL,
  	"key_id" varchar NOT NULL,
  	"wrapped_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "kyc_records_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "kyc_documents_id" integer;
  ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_verification_verified_by_id_users_id_fk" FOREIGN KEY ("verification_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "kyc_records_rels" ADD CONSTRAINT "kyc_records_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."kyc_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kyc_records_rels" ADD CONSTRAINT "kyc_records_rels_kyc_documents_fk" FOREIGN KEY ("kyc_documents_id") REFERENCES "public"."kyc_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "kyc_records_member_idx" ON "kyc_records" USING btree ("member_id");
  CREATE INDEX "kyc_records_pan_index_idx" ON "kyc_records" USING btree ("pan_index");
  CREATE INDEX "kyc_records_account_index_idx" ON "kyc_records" USING btree ("account_index");
  CREATE INDEX "kyc_records_verification_verification_verified_by_idx" ON "kyc_records" USING btree ("verification_verified_by_id");
  CREATE INDEX "kyc_records_updated_at_idx" ON "kyc_records" USING btree ("updated_at");
  CREATE INDEX "kyc_records_created_at_idx" ON "kyc_records" USING btree ("created_at");
  CREATE INDEX "kyc_records_rels_order_idx" ON "kyc_records_rels" USING btree ("order");
  CREATE INDEX "kyc_records_rels_parent_idx" ON "kyc_records_rels" USING btree ("parent_id");
  CREATE INDEX "kyc_records_rels_path_idx" ON "kyc_records_rels" USING btree ("path");
  CREATE INDEX "kyc_records_rels_kyc_documents_id_idx" ON "kyc_records_rels" USING btree ("kyc_documents_id");
  CREATE INDEX "kyc_documents_member_idx" ON "kyc_documents" USING btree ("member_id");
  CREATE INDEX "kyc_documents_updated_at_idx" ON "kyc_documents" USING btree ("updated_at");
  CREATE INDEX "kyc_documents_created_at_idx" ON "kyc_documents" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_kyc_records_fk" FOREIGN KEY ("kyc_records_id") REFERENCES "public"."kyc_records"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_kyc_documents_fk" FOREIGN KEY ("kyc_documents_id") REFERENCES "public"."kyc_documents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_kyc_records_id_idx" ON "payload_locked_documents_rels" USING btree ("kyc_records_id");
  CREATE INDEX "payload_locked_documents_rels_kyc_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("kyc_documents_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kyc_records" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "kyc_records_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "kyc_documents" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "kyc_records" CASCADE;
  DROP TABLE "kyc_records_rels" CASCADE;
  DROP TABLE "kyc_documents" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_kyc_records_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_kyc_documents_fk";
  
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('super-admin', 'editor');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  ALTER TABLE "applications_completed_steps" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_applications_completed_steps";
  CREATE TYPE "public"."enum_applications_completed_steps" AS ENUM('about', 'address', 'practice', 'portfolio', 'review');
  ALTER TABLE "applications_completed_steps" ALTER COLUMN "value" SET DATA TYPE "public"."enum_applications_completed_steps" USING "value"::"public"."enum_applications_completed_steps";
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE text;
  DROP TYPE "public"."enum_security_events_event";
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked', 'member-code-requested', 'member-code-sent', 'member-code-failed', 'member-code-rate-limited', 'member-locked', 'member-blocked', 'member-created', 'member-signed-in', 'member-signed-out', 'member-signed-out-everywhere', 'member-id-issued', 'application-submitted', 'application-approved', 'application-rejected', 'application-changes-requested');
  ALTER TABLE "security_events" ALTER COLUMN "event" SET DATA TYPE "public"."enum_security_events_event" USING "event"::"public"."enum_security_events_event";
  ALTER TABLE "login_challenges" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_login_challenges_purpose";
  CREATE TYPE "public"."enum_login_challenges_purpose" AS ENUM('signin', 'apply-artist', 'apply-partner');
  ALTER TABLE "login_challenges" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_login_challenges_purpose" USING "purpose"::"public"."enum_login_challenges_purpose";
  DROP INDEX "payload_locked_documents_rels_kyc_records_id_idx";
  DROP INDEX "payload_locked_documents_rels_kyc_documents_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "kyc_records_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "kyc_documents_id";
  DROP TYPE "public"."enum_kyc_records_id_type";
  DROP TYPE "public"."enum_kyc_records_account_type";
  DROP TYPE "public"."enum_kyc_records_verification_status";
  DROP TYPE "public"."enum_kyc_records_verification_method";
  DROP TYPE "public"."enum_kyc_records_pending_bank_pending_account_type";
  DROP TYPE "public"."enum_kyc_documents_kind";`)
}
