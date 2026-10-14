/**
 * Fails when the code reads an environment variable that is not both listed in .env.example and
 * checked at start-up in src/env.ts, so a new setting can never be added without being documented
 * and validated. A few variables are exempt, each for a stated reason (below).
 *
 *   pnpm check:env
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

/** Set by the platform or the tooling, never by us */
const PLATFORM = new Set([
  'NODE_ENV',
  'NEXT_PHASE',
  'NEXT_RUNTIME',
  'CI',
  'HOME',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_GIT_COMMIT_SHA',
  // Set by scripts/vercel-build.mjs around the migration step only
  'PAYLOAD_MIGRATING',
])

/** Read only by command-line scripts and tests, never by the site (docs/SETUP.md lists them) */
const SCRIPTS_AND_TESTS = new Set([
  'ADMIN_EMAIL', // pnpm create-admin, pnpm gate-token
  'ADMIN_NAME', // pnpm create-admin
  'ADMIN_PASSWORD', // pnpm create-admin
  'SEED_RESET', // pnpm seed:reset
  'APP_DATABASE_URL', // pnpm check:database
  'E2E_BASE_URL', // the browser tests
  'PLAYWRIGHT_CHROMIUM_PATH', // the browser tests
])

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (name === 'node_modules' || name === 'migrations' || name.startsWith('.')) return []
    if (statSync(full).isDirectory()) return files(full)
    return /\.(ts|tsx|mjs)$/.test(name) ? [full] : []
  })

const read = new Map<string, string>()
for (const file of [
  ...files(path.join(root, 'src')),
  ...files(path.join(root, 'scripts')),
  path.join(root, 'next.config.ts'),
]) {
  if (file === import.meta.filename) continue
  const text = readFileSync(file, 'utf8')
  // process.env.X, process.env['X'], and the typed env.X from loadEnv() (src/env.ts)
  for (const match of text.matchAll(
    /(?:process\.env|\benv)(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g,
  )) {
    const name = match[1] ?? match[2]!
    if (!read.has(name)) read.set(name, path.relative(root, file))
  }
}

const example = new Set(
  [
    ...readFileSync(path.join(root, '.env.example'), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm),
  ].map((m) => m[1]!),
)
const envSource = readFileSync(path.join(root, 'src/env.ts'), 'utf8')
const schemaBody = envSource.slice(envSource.indexOf('const schema = z.object({'))
const checked = new Set([...schemaBody.matchAll(/^\s{2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]!))

const problems: string[] = []
for (const [name, file] of [...read].sort()) {
  if (PLATFORM.has(name) || SCRIPTS_AND_TESTS.has(name)) continue
  if (!example.has(name)) problems.push(`${name} (read in ${file}) is not in .env.example`)
  if (!checked.has(name)) problems.push(`${name} (read in ${file}) is not checked in src/env.ts`)
}
for (const name of example) {
  if (!read.has(name)) problems.push(`${name} is in .env.example but nothing reads it`)
}

if (problems.length) {
  console.error(`Environment variables out of step:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Environment variables in step: ${read.size} read, all documented and checked.`)
