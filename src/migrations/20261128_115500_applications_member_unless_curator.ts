import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

/**
 * Guest curators apply without an account, so an application's member became optional
 * (20261128_115403_guest_curators). That also let deleting a member quietly empty the member of
 * their artist or trade applications, since the column is set to null when its member goes. Only
 * a curator's application may have no member: anything else is refused with the same not-null
 * error as before, so deleting a member who still has an application fails as it always did
 * (tests/int/deletion.int.spec.ts).
 *
 * A trigger rather than a CHECK constraint: Payload's development schema push drops constraints
 * it does not know about, and leaves triggers alone.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE OR REPLACE FUNCTION "applications_member_unless_curator"() RETURNS trigger
    LANGUAGE plpgsql AS $$
  BEGIN
    IF NEW."member_id" IS NULL AND NEW."type" <> 'curator' THEN
      RAISE EXCEPTION 'null value in column "member_id" of relation "applications" violates not-null constraint'
        USING ERRCODE = 'not_null_violation', TABLE = 'applications', COLUMN = 'member_id';
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER "applications_member_unless_curator"
    BEFORE INSERT OR UPDATE OF "member_id", "type" ON "applications"
    FOR EACH ROW EXECUTE FUNCTION "applications_member_unless_curator"();`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TRIGGER IF EXISTS "applications_member_unless_curator" ON "applications";
  DROP FUNCTION IF EXISTS "applications_member_unless_curator"();`)
}
