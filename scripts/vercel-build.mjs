#!/usr/bin/env node
/**
 * The build Vercel runs for every deployment: apply database migrations, then build.
 *
 * Migrations only run where they are meant to:
 *
 *   production deploy                → always (this is how the live schema changes)
 *   preview deploy                   → only with MIGRATE_ON_PREVIEW=1, which should be set only
 *                                      once Preview has a database of its own (a Neon branch)
 *   anywhere else (a local run, CI)  → always
 *
 * Migrations run as the database owner, DATABASE_URL_MIGRATE, when it is set; the build and the
 * running site use DATABASE_URL, the least-privileged app role (docs/SETUP.md, "Database roles").
 *
 * Previews used to migrate unconditionally. With Preview sharing production's DATABASE_URL, that
 * meant pushing any branch applied that branch's migrations to the live database before anyone
 * had reviewed them. A preview that skips them may show errors for brand-new fields, which is the
 * safe way round.
 */
import { spawnSync } from 'node:child_process'

const vercelEnv = process.env.VERCEL_ENV
const onVercel = Boolean(process.env.VERCEL)

const shouldMigrate =
  !onVercel || vercelEnv === 'production' || process.env.MIGRATE_ON_PREVIEW === '1'

const env = { ...process.env, NODE_OPTIONS: '--no-deprecation' }

const run = (args, extra = {}) => {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env: { ...env, ...extra } })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (shouldMigrate) {
  console.log(`Applying migrations (${vercelEnv || 'local'}).`)
  const owner = process.env.DATABASE_URL_MIGRATE
  console.log(owner ? 'Migrating as the database owner.' : 'Migrating with DATABASE_URL.')
  run(['payload', 'migrate'], {
    PAYLOAD_MIGRATING: '1',
    ...(owner ? { DATABASE_URL: owner } : {}),
  })
} else {
  console.log(
    `Skipping migrations on a ${vercelEnv} deployment. Set MIGRATE_ON_PREVIEW=1 once Preview has its own database.`,
  )
}

run(['build'])
