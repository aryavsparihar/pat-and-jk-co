import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The registered trade name is PAT & J.K. Co. (the founder, 13 November 2026): every place the
 * website's content spells it "PAT and J.K. Co." or "Pat and J.K. Co." now reads "PAT & J.K. Co.".
 *
 * Only the website's own content is touched: the site settings (site name, copyright name,
 * description), pages and their blocks, posts, ventures, people, media alt text, forms, header,
 * footer, categories and brands, with their saved versions so an editor opening one sees the same.
 * Records are never touched: applications, consent records, agreements, KYC, members, staff, form
 * submissions and the security log keep exactly what they say.
 *
 * Every text and JSON column of those tables is searched, so content added in the admin is caught
 * as well as the seeded text. "PJK" on its own is left as it is.
 */
// Written into the SQL as literals: a DO block cannot take bound parameters. Neither holds a quote.
const CONTENT_TABLES = String.raw`^_?(pages|posts|site_settings|tenants|ventures|people|media|forms|header|footer|categories)(_|$)`
const OLD = String.raw`P(AT|at) (and|AND) J\.K\. (Co|CO)\.`

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name ~ '${CONTENT_TABLES}'
      AND c.data_type IN ('text', 'character varying', 'jsonb')
  LOOP
    IF r.data_type = 'jsonb' THEN
      EXECUTE format(
        'UPDATE %I SET %I = regexp_replace(%I::text, %L, %L, %L)::jsonb WHERE %I::text ~ %L',
        r.table_name, r.column_name, r.column_name, '${OLD}', 'PAT & J.K. Co.', 'g', r.column_name, '${OLD}'
      );
    ELSE
      EXECUTE format(
        'UPDATE %I SET %I = regexp_replace(%I, %L, %L, %L) WHERE %I ~ %L',
        r.table_name, r.column_name, r.column_name, '${OLD}', 'PAT & J.K. Co.', 'g', r.column_name, '${OLD}'
      );
    END IF;
  END LOOP;
END $$;`),
  )
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // Not reversed: "PAT & J.K. Co." is the name, and there is no telling which were changed
}
