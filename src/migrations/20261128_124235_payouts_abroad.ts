import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_kyc_records_bank_location" AS ENUM('india', 'abroad');
  CREATE TYPE "public"."enum_kyc_records_pending_bank_pending_bank_location" AS ENUM('india', 'abroad');
  ALTER TABLE "kyc_records" ADD COLUMN "bank_location" "enum_kyc_records_bank_location";
  ALTER TABLE "kyc_records" ADD COLUMN "bank_country" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "currency" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "pending_bank_pending_bank_location" "enum_kyc_records_pending_bank_pending_bank_location";
  ALTER TABLE "kyc_records" ADD COLUMN "pending_bank_pending_bank_country" varchar;
  ALTER TABLE "kyc_records" ADD COLUMN "pending_bank_pending_currency" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "kyc_records" DROP COLUMN "bank_location";
  ALTER TABLE "kyc_records" DROP COLUMN "bank_country";
  ALTER TABLE "kyc_records" DROP COLUMN "currency";
  ALTER TABLE "kyc_records" DROP COLUMN "pending_bank_pending_bank_location";
  ALTER TABLE "kyc_records" DROP COLUMN "pending_bank_pending_bank_country";
  ALTER TABLE "kyc_records" DROP COLUMN "pending_bank_pending_currency";
  DROP TYPE "public"."enum_kyc_records_bank_location";
  DROP TYPE "public"."enum_kyc_records_pending_bank_pending_bank_location";`)
}
