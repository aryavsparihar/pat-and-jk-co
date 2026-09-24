import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ventures" ADD COLUMN "caption" varchar;
  ALTER TABLE "ventures" ADD COLUMN "opening_date" timestamp(3) with time zone;
  ALTER TABLE "ventures" ADD COLUMN "opening_note" varchar;
  ALTER TABLE "_ventures_v" ADD COLUMN "version_caption" varchar;
  ALTER TABLE "_ventures_v" ADD COLUMN "version_opening_date" timestamp(3) with time zone;
  ALTER TABLE "_ventures_v" ADD COLUMN "version_opening_note" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ventures" DROP COLUMN "caption";
  ALTER TABLE "ventures" DROP COLUMN "opening_date";
  ALTER TABLE "ventures" DROP COLUMN "opening_note";
  ALTER TABLE "_ventures_v" DROP COLUMN "version_caption";
  ALTER TABLE "_ventures_v" DROP COLUMN "version_opening_date";
  ALTER TABLE "_ventures_v" DROP COLUMN "version_opening_note";`)
}
