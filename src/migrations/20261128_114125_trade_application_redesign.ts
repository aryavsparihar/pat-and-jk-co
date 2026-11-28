import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "applications" ADD COLUMN "partner_country" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_proof" varchar;
  ALTER TABLE "applications" ADD COLUMN "partner_declarations_accurate" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "applications" DROP COLUMN "partner_country";
  ALTER TABLE "applications" DROP COLUMN "partner_proof";
  ALTER TABLE "applications" DROP COLUMN "partner_declarations_accurate";`)
}
