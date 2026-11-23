import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_help_tickets_status" AS ENUM('active', 'resolved');
  CREATE TABLE "help_tickets_attachments" (
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
  
  ALTER TABLE "help_tickets" ADD COLUMN "status" "enum_help_tickets_status" DEFAULT 'active' NOT NULL;
  ALTER TABLE "help_tickets" ADD COLUMN "resolved_at" timestamp(3) with time zone;
  ALTER TABLE "help_tickets_attachments" ADD CONSTRAINT "help_tickets_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."help_tickets"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "help_tickets_attachments_order_idx" ON "help_tickets_attachments" USING btree ("_order");
  CREATE INDEX "help_tickets_attachments_parent_id_idx" ON "help_tickets_attachments" USING btree ("_parent_id");
  CREATE INDEX "help_tickets_status_idx" ON "help_tickets" USING btree ("status");
  ALTER TABLE "help_tickets_attachments" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."help_tickets_attachments" TO pjk_app_access USING (true) WITH CHECK (true);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "help_tickets_attachments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "help_tickets_attachments" CASCADE;
  DROP INDEX "help_tickets_status_idx";
  ALTER TABLE "help_tickets" DROP COLUMN "status";
  ALTER TABLE "help_tickets" DROP COLUMN "resolved_at";
  DROP TYPE "public"."enum_help_tickets_status";`)
}
