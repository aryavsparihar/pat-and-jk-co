import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_kyc_documents_kind" ADD VALUE 'identity-photo';
  ALTER TABLE "site_settings" ADD COLUMN "artist_terms_id" integer;
  ALTER TABLE "applications_portfolio" ADD COLUMN "price_inr" numeric;
  ALTER TABLE "applications" ADD COLUMN "identity_code" varchar;
  ALTER TABLE "applications" ADD COLUMN "declarations_agree_terms" boolean;
  ALTER TABLE "applications" ADD COLUMN "declarations_agree_typed" varchar;
  ALTER TABLE "applications" ADD COLUMN "declarations_terms_document_id" integer;
  ALTER TABLE "kyc_records" ADD COLUMN "identity_code" varchar;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_artist_terms_id_media_id_fk" FOREIGN KEY ("artist_terms_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "applications" ADD CONSTRAINT "applications_declarations_terms_document_id_media_id_fk" FOREIGN KEY ("declarations_terms_document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_settings_artist_terms_idx" ON "site_settings" USING btree ("artist_terms_id");
  CREATE INDEX "applications_declarations_declarations_terms_document_idx" ON "applications" USING btree ("declarations_terms_document_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP CONSTRAINT "site_settings_artist_terms_id_media_id_fk";
  
  ALTER TABLE "applications" DROP CONSTRAINT "applications_declarations_terms_document_id_media_id_fk";
  
  ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_kyc_documents_kind";
  CREATE TYPE "public"."enum_kyc_documents_kind" AS ENUM('pan-card', 'masked-aadhaar', 'other-id', 'address-proof', 'bank-proof');
  ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_kyc_documents_kind" USING "kind"::"public"."enum_kyc_documents_kind";
  DROP INDEX "site_settings_artist_terms_idx";
  DROP INDEX "applications_declarations_declarations_terms_document_idx";
  ALTER TABLE "site_settings" DROP COLUMN "artist_terms_id";
  ALTER TABLE "applications_portfolio" DROP COLUMN "price_inr";
  ALTER TABLE "applications" DROP COLUMN "identity_code";
  ALTER TABLE "applications" DROP COLUMN "declarations_agree_terms";
  ALTER TABLE "applications" DROP COLUMN "declarations_agree_typed";
  ALTER TABLE "applications" DROP COLUMN "declarations_terms_document_id";
  ALTER TABLE "kyc_records" DROP COLUMN "identity_code";`)
}
