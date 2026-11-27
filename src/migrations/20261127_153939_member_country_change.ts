import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "members" ADD COLUMN "country_change_from" varchar;
  ALTER TABLE "members" ADD COLUMN "country_change_to" varchar;
  ALTER TABLE "members" ADD COLUMN "country_change_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "members" DROP COLUMN "country_change_from";
  ALTER TABLE "members" DROP COLUMN "country_change_to";
  ALTER TABLE "members" DROP COLUMN "country_change_at";`)
}
