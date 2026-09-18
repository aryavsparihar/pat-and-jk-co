import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_status" AS ENUM('active', 'suspended');
  CREATE TYPE "public"."enum_access_requests_status" AS ENUM('pending', 'approved', 'declined');
  CREATE TYPE "public"."enum_access_requests_role" AS ENUM('editor', 'super-admin');
  CREATE TYPE "public"."enum_security_events_event" AS ENUM('code-requested', 'code-sent', 'code-failed', 'code-verified', 'code-rate-limited', 'access-requested', 'access-approved', 'access-declined', 'login-blocked');
  CREATE TABLE "access_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"message" varchar,
  	"status" "enum_access_requests_status" DEFAULT 'pending' NOT NULL,
  	"role" "enum_access_requests_role" DEFAULT 'editor',
  	"decided_by_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"ip" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "security_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event" "enum_security_events_event" NOT NULL,
  	"email" varchar,
  	"ip" varchar,
  	"detail" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "login_challenges" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"code_hash" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"attempts" numeric DEFAULT 0,
  	"consumed_at" timestamp(3) with time zone,
  	"ip" varchar,
  	"deliverable" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "people" ADD COLUMN "caption" varchar;
  ALTER TABLE "users" ADD COLUMN "status" "enum_users_status" DEFAULT 'active' NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "access_requests_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "security_events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "login_challenges_id" integer;
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "access_requests_email_idx" ON "access_requests" USING btree ("email");
  CREATE INDEX "access_requests_decided_by_idx" ON "access_requests" USING btree ("decided_by_id");
  CREATE INDEX "access_requests_updated_at_idx" ON "access_requests" USING btree ("updated_at");
  CREATE INDEX "access_requests_created_at_idx" ON "access_requests" USING btree ("created_at");
  CREATE INDEX "security_events_event_idx" ON "security_events" USING btree ("event");
  CREATE INDEX "security_events_email_idx" ON "security_events" USING btree ("email");
  CREATE INDEX "security_events_updated_at_idx" ON "security_events" USING btree ("updated_at");
  CREATE INDEX "security_events_created_at_idx" ON "security_events" USING btree ("created_at");
  CREATE INDEX "login_challenges_email_idx" ON "login_challenges" USING btree ("email");
  CREATE INDEX "login_challenges_expires_at_idx" ON "login_challenges" USING btree ("expires_at");
  CREATE INDEX "login_challenges_updated_at_idx" ON "login_challenges" USING btree ("updated_at");
  CREATE INDEX "login_challenges_created_at_idx" ON "login_challenges" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_access_requests_fk" FOREIGN KEY ("access_requests_id") REFERENCES "public"."access_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_security_events_fk" FOREIGN KEY ("security_events_id") REFERENCES "public"."security_events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_login_challenges_fk" FOREIGN KEY ("login_challenges_id") REFERENCES "public"."login_challenges"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_access_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("access_requests_id");
  CREATE INDEX "payload_locked_documents_rels_security_events_id_idx" ON "payload_locked_documents_rels" USING btree ("security_events_id");
  CREATE INDEX "payload_locked_documents_rels_login_challenges_id_idx" ON "payload_locked_documents_rels" USING btree ("login_challenges_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "access_requests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "security_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "login_challenges" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "access_requests" CASCADE;
  DROP TABLE "security_events" CASCADE;
  DROP TABLE "login_challenges" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_access_requests_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_security_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_login_challenges_fk";
  
  DROP INDEX "payload_locked_documents_rels_access_requests_id_idx";
  DROP INDEX "payload_locked_documents_rels_security_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_login_challenges_id_idx";
  ALTER TABLE "people" DROP COLUMN "caption";
  ALTER TABLE "users" DROP COLUMN "status";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "access_requests_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "security_events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "login_challenges_id";
  DROP TYPE "public"."enum_users_status";
  DROP TYPE "public"."enum_access_requests_status";
  DROP TYPE "public"."enum_access_requests_role";
  DROP TYPE "public"."enum_security_events_event";`)
}
