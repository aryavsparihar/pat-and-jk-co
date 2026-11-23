import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_members_artist_access_standing" AS ENUM('active', 'suspended', 'removed');
  CREATE TYPE "public"."enum_members_partner_access_standing" AS ENUM('active', 'suspended', 'removed');
  ALTER TABLE "members" ADD COLUMN "artist_access_standing" "enum_members_artist_access_standing" DEFAULT 'active';
  ALTER TABLE "members" ADD COLUMN "artist_access_reason" varchar;
  ALTER TABLE "members" ADD COLUMN "artist_access_changed_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "partner_access_standing" "enum_members_partner_access_standing" DEFAULT 'active';
  ALTER TABLE "members" ADD COLUMN "partner_access_reason" varchar;
  ALTER TABLE "members" ADD COLUMN "partner_access_changed_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "members" DROP COLUMN "artist_access_standing";
  ALTER TABLE "members" DROP COLUMN "artist_access_reason";
  ALTER TABLE "members" DROP COLUMN "artist_access_changed_at";
  ALTER TABLE "members" DROP COLUMN "partner_access_standing";
  ALTER TABLE "members" DROP COLUMN "partner_access_reason";
  ALTER TABLE "members" DROP COLUMN "partner_access_changed_at";
  DROP TYPE "public"."enum_members_artist_access_standing";
  DROP TYPE "public"."enum_members_partner_access_standing";`)
}
