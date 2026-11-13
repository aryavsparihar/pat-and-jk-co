/**
 * Help Center tickets (src/collections/HelpTickets.ts): the ticket number, unique, and the kind of
 * request. Row-level security like every other table, so only the app's own role can reach it.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_help_tickets_request_type" AS ENUM('artist', 'partner');
  CREATE TYPE "public"."enum_help_tickets_nature" AS ENUM('technical', 'business');
  CREATE TABLE "help_tickets" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ticket" varchar NOT NULL,
  	"request_type" "enum_help_tickets_request_type" NOT NULL,
  	"nature" "enum_help_tickets_nature" NOT NULL,
  	"member_code" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "help_tickets_id" integer;
  CREATE UNIQUE INDEX "help_tickets_ticket_idx" ON "help_tickets" USING btree ("ticket");
  CREATE INDEX "help_tickets_member_code_idx" ON "help_tickets" USING btree ("member_code");
  CREATE INDEX "help_tickets_updated_at_idx" ON "help_tickets" USING btree ("updated_at");
  CREATE INDEX "help_tickets_created_at_idx" ON "help_tickets" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_help_tickets_fk" FOREIGN KEY ("help_tickets_id") REFERENCES "public"."help_tickets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_help_tickets_id_idx" ON "payload_locked_documents_rels" USING btree ("help_tickets_id");
  ALTER TABLE "help_tickets" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."help_tickets" TO pjk_app_access USING (true) WITH CHECK (true);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "help_tickets" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "help_tickets" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_help_tickets_fk";
  
  DROP INDEX "payload_locked_documents_rels_help_tickets_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "help_tickets_id";
  DROP TYPE "public"."enum_help_tickets_request_type";
  DROP TYPE "public"."enum_help_tickets_nature";`)
}
