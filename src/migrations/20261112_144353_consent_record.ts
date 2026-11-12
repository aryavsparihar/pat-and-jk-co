import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "applications_consent_record" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"submitted_at" timestamp(3) with time zone,
  	"consent_checked" boolean,
  	"typed" varchar,
  	"policy_title" varchar,
  	"policy_version" varchar,
  	"policy_sha256" varchar,
  	"ip" varchar,
  	"location" varchar,
  	"user_agent" varchar,
  	"policy_text" varchar
  );
  
  ALTER TABLE "applications_consent_record" ADD CONSTRAINT "applications_consent_record_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "applications_consent_record_order_idx" ON "applications_consent_record" USING btree ("_order");
  CREATE INDEX "applications_consent_record_parent_id_idx" ON "applications_consent_record" USING btree ("_parent_id");
  ALTER TABLE "applications_consent_record" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."applications_consent_record" TO pjk_app_access USING (true) WITH CHECK (true);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "applications_consent_record" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "applications_consent_record" CASCADE;`)
}
