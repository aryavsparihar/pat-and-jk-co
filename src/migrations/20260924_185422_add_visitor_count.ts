import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "visitor_counts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"total" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "site_settings" ADD COLUMN "show_visitor_count" boolean DEFAULT true;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "visitor_counts_id" integer;
  ALTER TABLE "visitor_counts" ADD CONSTRAINT "visitor_counts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "visitor_counts_tenant_idx" ON "visitor_counts" USING btree ("tenant_id");
  CREATE INDEX "visitor_counts_updated_at_idx" ON "visitor_counts" USING btree ("updated_at");
  CREATE INDEX "visitor_counts_created_at_idx" ON "visitor_counts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_visitor_counts_fk" FOREIGN KEY ("visitor_counts_id") REFERENCES "public"."visitor_counts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_visitor_counts_id_idx" ON "payload_locked_documents_rels" USING btree ("visitor_counts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "visitor_counts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "visitor_counts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_visitor_counts_fk";
  
  DROP INDEX "payload_locked_documents_rels_visitor_counts_id_idx";
  ALTER TABLE "site_settings" DROP COLUMN "show_visitor_count";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "visitor_counts_id";`)
}
