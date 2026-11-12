import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_agreement_executions_kind" AS ENUM('artist', 'partner');
  CREATE TYPE "public"."enum_agreement_executions_state" AS ENUM('in-progress', 'pending-countersignature', 'executed');
  ALTER TYPE "public"."enum_kyc_documents_kind" ADD VALUE 'agreement-photo';
  ALTER TYPE "public"."enum_kyc_documents_kind" ADD VALUE 'agreement-signed';
  ALTER TYPE "public"."enum_kyc_documents_kind" ADD VALUE 'agreement-countersigned';
  CREATE TABLE "agreement_executions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"kind" "enum_agreement_executions_kind" NOT NULL,
  	"member_code" varchar,
  	"state" "enum_agreement_executions_state" DEFAULT 'in-progress' NOT NULL,
  	"version" varchar,
  	"document_digest" varchar,
  	"code_hash" varchar,
  	"code_issued_at" timestamp(3) with time zone,
  	"code_expires_at" timestamp(3) with time zone,
  	"verification_code" varchar,
  	"photo_id" integer,
  	"photo_at" timestamp(3) with time zone,
  	"photo_sha256" varchar,
  	"signer_name" varchar,
  	"signer_firm" varchar,
  	"signer_tax_id_masked" varchar,
  	"signer_firm_registration" varchar,
  	"signer_email" varchar,
  	"signer_phone" varchar,
  	"signer_address" varchar,
  	"typed" varchar,
  	"signed_at" timestamp(3) with time zone,
  	"signed_at_ist" varchar,
  	"ip" varchar,
  	"user_agent" varchar,
  	"signed_pdf_id" integer,
  	"signed_pdf_sha256" varchar,
  	"countersigned_pdf_id" integer,
  	"countersigned_pdf_sha256" varchar,
  	"countersigned_at" timestamp(3) with time zone,
  	"countersigned_by_id" integer,
  	"sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "agreement_executions_id" integer;
  ALTER TABLE "agreement_executions" ADD CONSTRAINT "agreement_executions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agreement_executions" ADD CONSTRAINT "agreement_executions_photo_id_kyc_documents_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."kyc_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agreement_executions" ADD CONSTRAINT "agreement_executions_signed_pdf_id_kyc_documents_id_fk" FOREIGN KEY ("signed_pdf_id") REFERENCES "public"."kyc_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agreement_executions" ADD CONSTRAINT "agreement_executions_countersigned_pdf_id_kyc_documents_id_fk" FOREIGN KEY ("countersigned_pdf_id") REFERENCES "public"."kyc_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "agreement_executions" ADD CONSTRAINT "agreement_executions_countersigned_by_id_users_id_fk" FOREIGN KEY ("countersigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "agreement_executions_member_idx" ON "agreement_executions" USING btree ("member_id");
  CREATE INDEX "agreement_executions_member_code_idx" ON "agreement_executions" USING btree ("member_code");
  CREATE INDEX "agreement_executions_photo_idx" ON "agreement_executions" USING btree ("photo_id");
  CREATE INDEX "agreement_executions_signed_pdf_idx" ON "agreement_executions" USING btree ("signed_pdf_id");
  CREATE INDEX "agreement_executions_countersigned_pdf_idx" ON "agreement_executions" USING btree ("countersigned_pdf_id");
  CREATE INDEX "agreement_executions_countersigned_by_idx" ON "agreement_executions" USING btree ("countersigned_by_id");
  CREATE INDEX "agreement_executions_updated_at_idx" ON "agreement_executions" USING btree ("updated_at");
  CREATE INDEX "agreement_executions_created_at_idx" ON "agreement_executions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agreement_executions_fk" FOREIGN KEY ("agreement_executions_id") REFERENCES "public"."agreement_executions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_agreement_executions_id_idx" ON "payload_locked_documents_rels" USING btree ("agreement_executions_id");
  ALTER TABLE "agreement_executions" ENABLE ROW LEVEL SECURITY;
  CREATE POLICY pjk_app ON "public"."agreement_executions" TO pjk_app_access USING (true) WITH CHECK (true);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agreement_executions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "agreement_executions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_agreement_executions_fk";
  
  ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_kyc_documents_kind";
  CREATE TYPE "public"."enum_kyc_documents_kind" AS ENUM('pan-card', 'masked-aadhaar', 'other-id', 'address-proof', 'bank-proof', 'identity-photo');
  ALTER TABLE "kyc_documents" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_kyc_documents_kind" USING "kind"::"public"."enum_kyc_documents_kind";
  DROP INDEX "payload_locked_documents_rels_agreement_executions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "agreement_executions_id";
  DROP TYPE "public"."enum_agreement_executions_kind";
  DROP TYPE "public"."enum_agreement_executions_state";`)
}
