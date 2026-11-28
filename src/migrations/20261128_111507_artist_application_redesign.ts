import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "applications" ALTER COLUMN "practice_price_range" SET DATA TYPE text;
  DROP TYPE "public"."enum_applications_practice_price_range";
  CREATE TYPE "public"."enum_applications_practice_price_range" AS ENUM('under-10k', '10k-25k', '25k-1l', '1l-5l', 'over-5l', 'under-25k', 'not-sure');
  ALTER TABLE "applications" ALTER COLUMN "practice_price_range" SET DATA TYPE "public"."enum_applications_practice_price_range" USING "practice_price_range"::"public"."enum_applications_practice_price_range";
  ALTER TABLE "applications" ADD COLUMN "about_consent_processing" boolean;
  ALTER TABLE "applications" ADD COLUMN "about_consented_at" timestamp(3) with time zone;
  ALTER TABLE "applications" ADD COLUMN "declarations_not_copy" boolean;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "applications" ALTER COLUMN "practice_price_range" SET DATA TYPE text;
  DROP TYPE "public"."enum_applications_practice_price_range";
  CREATE TYPE "public"."enum_applications_practice_price_range" AS ENUM('under-25k', '25k-1l', '1l-5l', 'over-5l', 'not-sure');
  ALTER TABLE "applications" ALTER COLUMN "practice_price_range" SET DATA TYPE "public"."enum_applications_practice_price_range" USING "practice_price_range"::"public"."enum_applications_practice_price_range";
  ALTER TABLE "applications" DROP COLUMN "about_consent_processing";
  ALTER TABLE "applications" DROP COLUMN "about_consented_at";
  ALTER TABLE "applications" DROP COLUMN "declarations_not_copy";`)
}
