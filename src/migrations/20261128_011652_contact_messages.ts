import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_enquiries_topic" AS ENUM('general', 'partnership', 'working-for-pjk', 'suppliers', 'press', 'visiting', 'commission', 'trade-account', 'represented', 'guest-curator', 'curatorial-collection', 'curatorial-set', 'account', 'website', 'privacy');
  CREATE TYPE "public"."enum_enquiries_inbox" AS ENUM('business', 'tech', 'compliance');
  CREATE TYPE "public"."enum_enquiries_status" AS ENUM('receiving', 'active', 'resolved');
  CREATE TABLE "enquiries_attachments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"filename" varchar NOT NULL,
  	"content_type" varchar NOT NULL,
  	"size" numeric,
  	"storage_key" varchar NOT NULL,
  	"key_id" varchar NOT NULL,
  	"wrapped_key" varchar NOT NULL
  );
  
  CREATE TABLE "enquiries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"topic" "enum_enquiries_topic" NOT NULL,
  	"inbox" "enum_enquiries_inbox" NOT NULL,
  	"message" varchar NOT NULL,
  	"status" "enum_enquiries_status" DEFAULT 'active' NOT NULL,
  	"resolved_at" timestamp(3) with time zone,
  	"upload_token_hash" varchar,
  	"upload_expires_at" timestamp(3) with time zone,
  	"upload_folder" varchar,
  	"upload_files" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "enquiries_id" integer;
  ALTER TABLE "enquiries_attachments" ADD CONSTRAINT "enquiries_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "enquiries_attachments_order_idx" ON "enquiries_attachments" USING btree ("_order");
  CREATE INDEX "enquiries_attachments_parent_id_idx" ON "enquiries_attachments" USING btree ("_parent_id");
  CREATE INDEX "enquiries_email_idx" ON "enquiries" USING btree ("email");
  CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status");
  CREATE INDEX "enquiries_updated_at_idx" ON "enquiries" USING btree ("updated_at");
  CREATE INDEX "enquiries_created_at_idx" ON "enquiries" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_enquiries_fk" FOREIGN KEY ("enquiries_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_enquiries_id_idx" ON "payload_locked_documents_rels" USING btree ("enquiries_id");
  ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."enquiries" TO pjk_app_access USING (true) WITH CHECK (true);
  ALTER TABLE "enquiries_attachments" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."enquiries_attachments" TO pjk_app_access USING (true) WITH CHECK (true);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "enquiries_attachments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "enquiries" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "enquiries_attachments" CASCADE;
  DROP TABLE "enquiries" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_enquiries_fk";
  
  DROP INDEX "payload_locked_documents_rels_enquiries_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "enquiries_id";
  DROP TYPE "public"."enum_enquiries_topic";
  DROP TYPE "public"."enum_enquiries_inbox";
  DROP TYPE "public"."enum_enquiries_status";`)
}
