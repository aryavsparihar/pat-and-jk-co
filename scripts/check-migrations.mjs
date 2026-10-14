#!/usr/bin/env node
/**
 * Migrations only add things (docs/RUNBOOK.md, "Rolling back"). The previous version of the code
 * must always be able to run against the current database, or a rollback in Vercel would break
 * the site. So between one migration's schema snapshot and the next, nothing may be removed or
 * changed in a way the old code would trip over:
 *
 *   a table or column dropped (or renamed, which looks the same), a column's type changed, a
 *   column becoming required with no default, or a value removed from an enum (Payload rebuilds
 *   an enum to add a value in the middle, which is fine as long as every old value stays).
 *
 * And no migration's up() may delete data (DELETE FROM, TRUNCATE): data migrations only fill
 * empty fields.
 *
 * To remove something, first ship a release that stops using it, and drop it in a later one.
 * A deliberate exception goes in migrations-allow.txt with its reason.
 *
 *   node scripts/check-migrations.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(import.meta.dirname, '../src/migrations')
const allowed = new Set(
  readFileSync(path.resolve(import.meta.dirname, '../migrations-allow.txt'), 'utf8')
    .split('\n')
    .map((l) => l.split('#')[0].trim())
    .filter(Boolean),
)

const problems = []
const report = (migration, message) => {
  if (!allowed.has(migration)) problems.push(`${migration}: ${message}`)
}

const snapshots = readdirSync(dir)
  .filter((f) => /^\d{8}_\d{6}_.+\.json$/.test(f))
  .sort()
for (let i = 1; i < snapshots.length; i++) {
  const before = JSON.parse(readFileSync(path.join(dir, snapshots[i - 1]), 'utf8'))
  const after = JSON.parse(readFileSync(path.join(dir, snapshots[i]), 'utf8'))
  const name = snapshots[i].replace(/\.json$/, '')
  for (const [table, old] of Object.entries(before.tables ?? {})) {
    const next = after.tables?.[table]
    if (!next) {
      report(name, `drops table ${table}`)
      continue
    }
    for (const [column, was] of Object.entries(old.columns ?? {})) {
      const now = next.columns?.[column]
      if (!now) report(name, `drops column ${table}.${column}`)
      else {
        if (now.type !== was.type) report(name, `changes ${table}.${column} from ${was.type} to ${now.type}`)
        if (now.notNull && !was.notNull && now.default === undefined)
          report(name, `makes ${table}.${column} required with no default`)
      }
    }
  }
  for (const [name_, old] of Object.entries(before.enums ?? {})) {
    const now = after.enums?.[name_]
    if (!now) continue // an unused enum dropped with its column is reported as the column
    const lost = old.values.filter((v) => !now.values.includes(v))
    if (lost.length) report(name, `removes ${lost.join(', ')} from ${name_}`)
  }
}

for (const file of readdirSync(dir).filter((f) => /^\d{8}_\d{6}_.+\.ts$/.test(f))) {
  const text = readFileSync(path.join(dir, file), 'utf8')
  const up = text.slice(text.indexOf('async function up'), text.indexOf('async function down'))
  const name = file.replace(/\.ts$/, '')
  for (const [pattern, what] of [
    [/\bDELETE\s+FROM\b/i, 'deletes rows'],
    [/\bTRUNCATE\b/i, 'truncates a table'],
    [/\bDROP\s+TABLE\b/i, 'drops a table'],
    [/\bDROP\s+COLUMN\b/i, 'drops a column'],
    [/\bRENAME\s+(COLUMN|TO)\b/i, 'renames something'],
  ])
    if (pattern.test(up)) report(name, what)
}

if (problems.length) {
  console.error(`Migrations must only add things (docs/RUNBOOK.md):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Migrations only add things: ${snapshots.length} snapshots compared.`)
