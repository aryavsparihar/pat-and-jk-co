import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "help_tickets" ADD COLUMN "follow_ups" numeric DEFAULT 0;
  ALTER TABLE "help_tickets" ADD COLUMN "last_follow_up_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "help_tickets" DROP COLUMN "follow_ups";
  ALTER TABLE "help_tickets" DROP COLUMN "last_follow_up_at";`)
}
