/**
 * Fails when the database gives more than intended (docs/SECURITY.md, "Database access"):
 *
 *   - every table in the public schema has Row-Level Security on, and a policy for the app's
 *     group role, pjk_app_access, and no other role is given a policy;
 *   - pjk_app_access has only SELECT, INSERT, UPDATE and DELETE on tables (the security log only
 *     SELECT and INSERT, the migrations table only SELECT), only USAGE and SELECT on sequences, no
 *     CREATE on the schema, owns nothing, and is not a superuser, BYPASSRLS, CREATEROLE or CREATEDB;
 *   - the only function it may call that runs with the owner's rights (SECURITY DEFINER) is
 *     erase_from_security_log, with a fixed search path, and nobody else may call that.
 *
 * Run with the owner's connection (DATABASE_URL_MIGRATE, or DATABASE_URL where they are the same,
 * as in CI). With APP_DATABASE_URL, it also signs in as a login role in pjk_app_access and checks
 * from the inside: an ordinary read works; DDL, a security-log change and TRUNCATE are refused.
 *
 *   pnpm check:database
 */
import 'dotenv/config'
import { Client } from 'pg'

const APP = 'pjk_app_access'
/** Functions that run with the owner's rights and that the app may call; nobody else may */
const DEFINER_FUNCTIONS = ['erase_from_security_log']
const TABLE_PRIVILEGES: Record<string, string[]> = {
  security_events: ['INSERT', 'SELECT'],
  payload_migrations: ['SELECT'],
}
const DEFAULT_TABLE_PRIVILEGES = ['DELETE', 'INSERT', 'SELECT', 'UPDATE']

const problems: string[] = []
const fail = (message: string) => problems.push(message)

const owner = new Client({
  connectionString: process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL,
})
await owner.connect()

const role = (
  await owner.query(
    `SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = $1`,
    [APP],
  )
).rows[0]
if (!role) {
  fail(`The role ${APP} does not exist: has the app_role_and_rls migration run?`)
} else {
  for (const attribute of [
    'rolsuper',
    'rolbypassrls',
    'rolcreaterole',
    'rolcreatedb',
    'rolcanlogin',
  ])
    if (role[attribute]) fail(`${APP} has ${attribute}`)
}

const tables = (
  await owner.query(
    `SELECT c.relname AS name, c.relrowsecurity AS rls, pg_get_userbyid(c.relowner) AS owner
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1`,
  )
).rows as { name: string; rls: boolean; owner: string }[]

const policies = (
  await owner.query(
    `SELECT tablename, policyname, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public'`,
  )
).rows as { tablename: string; policyname: string; roles: string[] }[]

const grants = (
  await owner.query(
    `SELECT table_name, privilege_type FROM information_schema.role_table_grants
     WHERE grantee = $1 AND table_schema = 'public'`,
    [APP],
  )
).rows as { table_name: string; privilege_type: string }[]

for (const table of tables) {
  if (!table.rls)
    fail(
      `${table.name}: Row-Level Security is off (enable it in the migration that adds the table)`,
    )
  if (table.owner === APP) fail(`${table.name}: owned by ${APP}`)
  const own = policies.filter((p) => p.tablename === table.name)
  if (!own.some((p) => p.roles.includes(APP))) fail(`${table.name}: no policy for ${APP}`)
  for (const p of own)
    for (const r of p.roles)
      if (r !== APP) fail(`${table.name}: policy ${p.policyname} is for ${r}, not only ${APP}`)
  const allowed = TABLE_PRIVILEGES[table.name] ?? DEFAULT_TABLE_PRIVILEGES
  const held = grants
    .filter((g) => g.table_name === table.name)
    .map((g) => g.privilege_type)
    .sort()
  const extra = held.filter((p) => !allowed.includes(p))
  const missing = allowed.filter((p) => !held.includes(p))
  if (extra.length) fail(`${table.name}: ${APP} has more than it needs: ${extra.join(', ')}`)
  if (missing.length) fail(`${table.name}: ${APP} is missing ${missing.join(', ')}`)
}

const sequenceGrants = (
  await owner.query(
    `SELECT c.relname AS name, has_sequence_privilege($1, c.oid, 'UPDATE') AS can_update
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'S'`,
    [APP],
  )
).rows as { name: string; can_update: boolean }[]
for (const s of sequenceGrants)
  if (s.can_update) fail(`sequence ${s.name}: ${APP} may UPDATE (setval)`)

const definers = (
  await owner.query(
    `SELECT p.proname AS name, has_function_privilege($1, p.oid, 'EXECUTE') AS app,
            has_function_privilege('public', p.oid, 'EXECUTE') AS everyone,
            coalesce(array_to_string(p.proconfig, ','), '') AS config
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef`,
    [APP],
  )
).rows as { name: string; app: boolean; everyone: boolean; config: string }[]
for (const f of definers) {
  if (!DEFINER_FUNCTIONS.includes(f.name)) {
    if (f.app) fail(`function ${f.name} runs with the owner's rights and ${APP} may call it`)
    continue
  }
  if (f.everyone) fail(`function ${f.name}: anyone may call it, not only ${APP}`)
  if (!f.config.includes('search_path=')) fail(`function ${f.name} has no fixed search_path`)
}
for (const name of DEFINER_FUNCTIONS)
  if (!definers.some((f) => f.name === name && f.app))
    fail(`function ${name} is missing, or ${APP} may not call it`)

const schema = (
  await owner.query(`SELECT has_schema_privilege($1, 'public', 'CREATE') AS can_create`, [APP])
).rows[0]
if (schema?.can_create) fail(`${APP} may CREATE in the public schema`)
await owner.end()

// From the inside, as a login role in the group
if (process.env.APP_DATABASE_URL) {
  const app = new Client({ connectionString: process.env.APP_DATABASE_URL })
  await app.connect()
  const refused = async (statement: string, what: string) => {
    try {
      await app.query('BEGIN')
      await app.query(statement)
      fail(`as the app role, ${what} was allowed`)
    } catch {
      // refused, as it should be
    } finally {
      await app.query('ROLLBACK')
    }
  }
  try {
    await app.query('SELECT count(*) FROM public.pages')
  } catch (error) {
    fail(`as the app role, an ordinary read failed: ${(error as Error).message}`)
  }
  await refused('CREATE TABLE public.should_not_exist (id int)', 'creating a table')
  await refused('ALTER TABLE public.pages ADD COLUMN should_not_exist int', 'altering a table')
  await refused('DROP TABLE public.pages', 'dropping a table')
  await refused('TRUNCATE public.pages', 'truncating a table')
  await refused(`UPDATE public.security_events SET detail = 'changed'`, 'changing the security log')
  await refused('DELETE FROM public.security_events', 'deleting from the security log')
  await refused(`DELETE FROM public.payload_migrations`, 'changing the migrations table')
  // The one way addresses leave the security log refuses anyone not actually deleted
  await refused(
    `SELECT public.erase_from_security_log(ARRAY['someone@example.test'], 'Deleted artist (AT999999)')`,
    'erasing addresses from the security log for someone not deleted',
  )
  await app.end()
}

if (problems.length) {
  console.error(`Database access is wider than intended:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Database access as intended: ${tables.length} tables, RLS on each, ${APP} limited.`)
