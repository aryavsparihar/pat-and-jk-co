import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_ventures_theme" AS ENUM('pjk', 'phulhaar');
  CREATE TYPE "public"."enum__ventures_v_version_theme" AS ENUM('pjk', 'phulhaar');
  ALTER TABLE "ventures" ADD COLUMN "theme" "enum_ventures_theme";
  ALTER TABLE "_ventures_v" ADD COLUMN "version_theme" "enum__ventures_v_version_theme";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "ventures" DROP COLUMN "theme";
  ALTER TABLE "_ventures_v" DROP COLUMN "version_theme";
  DROP TYPE "public"."enum_ventures_theme";
  DROP TYPE "public"."enum__ventures_v_version_theme";`)
}
