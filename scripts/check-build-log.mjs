#!/usr/bin/env node
/**
 * Fails when a build log has a warning that is not on the allowlist (build-warnings.allow), or
 * when a public page is no longer prerendered.
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
  // Patterns from our own allowlist file in the repository
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  .map((line) => new RegExp(line.split(/\s+#\s/)[0].trim(), 'i'))

const WARNING = /\b(warn|warning|deprecated)\b|⚠/i
const found = log
  .split('\n')
  .map((line) => line.replace(/\u001b\[[0-9;]*m/g, '').trim())
  // Not the commands themselves, as pnpm echoes them ("$ cross-env NODE_OPTIONS=--no-deprecation …")
  .filter((line) => !line.startsWith('$ '))
  .filter((line) => WARNING.test(line) && !allow.some((pattern) => pattern.test(line)))

/*
 * Every public page must stay static and cached, the same for every visitor, with who is signed in
 * shown by the browser alone (src/components/session/sessionStore.ts). A page under the tenant
 * routes that the route table marks ƒ (rendered on each request) is allowed only if it is one of
 * these, which are per-visitor by nature; anything else that turns dynamic (a header read, a
 * cookie, a nonce) fails the build here rather than slowing the site and risking one visitor's
 * page being shown to another.
 */
const MAY_BE_DYNAMIC = [
  /^\/tenant-sites\/\[host\]\/account(\/|$)/,
  /^\/tenant-sites\/\[host\]\/collaborate\/(artists|partners|signin)$/,
  /^\/tenant-sites\/\[host\]\/robots\.txt$/,
  /^\/tenant-sites\/-\/sitemap\.xml$/,
]
const routes = log
  .split('\n')
  .map((line) => line.replace(/\u001b\[[0-9;]*m/g, ''))
  .map((line) => /([○●ƒ])\s+(\/tenant-sites\/\S+)/.exec(line))
  .filter(Boolean)
const newlyDynamic = routes
  .filter(([, kind, route]) => kind === 'ƒ' && !MAY_BE_DYNAMIC.some((p) => p.test(route)))
  .map(([, , route]) => route)

if (found.length) {
  console.error(`The build printed warnings that are not on the allowlist (build-warnings.allow):`)
  for (const line of found) console.error(`  ${line}`)
}
if (newlyDynamic.length) {
  console.error('These public pages are no longer prerendered; find what made them dynamic:')
  for (const route of newlyDynamic) console.error(`  ${route}`)
}
if (routes.length === 0 && /Route \(app\)/.test(log)) {
  console.error('The route table has no tenant pages; the check below it cannot run.')
  process.exit(1)
}
if (found.length || newlyDynamic.length) process.exit(1)
console.log(
  `The build printed no warnings beyond the allowlist, and ${routes.filter(([, k]) => k !== 'ƒ').length} public pages are prerendered.`,
)
