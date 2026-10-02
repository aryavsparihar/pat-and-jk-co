import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "office_address_show" boolean;
  ALTER TABLE "pages" ADD COLUMN "office_address_label" varchar;
  ALTER TABLE "pages" ADD COLUMN "office_address_note" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_office_address_show" boolean;
  ALTER TABLE "_pages_v" ADD COLUMN "version_office_address_label" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_office_address_note" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "office_line1" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "office_line2" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "office_landmark" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "office_city" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "office_state" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "office_postal_code" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "office_country" varchar DEFAULT 'India';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "office_address_show";
  ALTER TABLE "pages" DROP COLUMN "office_address_label";
  ALTER TABLE "pages" DROP COLUMN "office_address_note";
  ALTER TABLE "_pages_v" DROP COLUMN "version_office_address_show";
  ALTER TABLE "_pages_v" DROP COLUMN "version_office_address_label";
  ALTER TABLE "_pages_v" DROP COLUMN "version_office_address_note";
  ALTER TABLE "site_settings" DROP COLUMN "office_line1";
  ALTER TABLE "site_settings" DROP COLUMN "office_line2";
  ALTER TABLE "site_settings" DROP COLUMN "office_landmark";
  ALTER TABLE "site_settings" DROP COLUMN "office_city";
  ALTER TABLE "site_settings" DROP COLUMN "office_state";
  ALTER TABLE "site_settings" DROP COLUMN "office_postal_code";
  ALTER TABLE "site_settings" DROP COLUMN "office_country";`)
}
