#!/usr/bin/env node
/**
 * Fails when a build log has a warning that is not on the allowlist (build-warnings.allow).
 * CI runs the build through `tee` and then this, so a new warning stops the pipeline instead of
 * scrolling past. Each allowlist line is a regular expression, then "#" and the reason it is
 * harmless with a date to look at it again.
 *
 *   node scripts/check-build-log.mjs build.log
 */
import { readFileSync } from 'node:fs'

const log = readFileSync(process.argv[2], 'utf8')
const allow = readFileSync(new URL('../build-warnings.allow', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => new RegExp(line.split(/\s+#\s/)[0].trim(), 'i'))

const WARNING = /\b(warn|warning|deprecated)\b|⚠/i
const found = log
  .split('\n')
  .map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trim())
  // Not the commands themselves, as pnpm echoes them ("$ cross-env NODE_OPTIONS=--no-deprecation …")
  .filter((line) => !line.startsWith('$ '))
  .filter((line) => WARNING.test(line) && !allow.some((pattern) => pattern.test(line)))

if (found.length) {
  console.error(`The build printed warnings that are not on the allowlist (build-warnings.allow):`)
  for (const line of found) console.error(`  ${line}`)
  process.exit(1)
}
console.log('The build printed no warnings beyond the allowlist.')
