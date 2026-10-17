import type { Payload } from 'payload'

/**
 * Server errors that outlive the logs. Vercel's free plan keeps runtime logs for one hour, so an
 * error that happened overnight, like a delete in the admin that only said "Something went
 * wrong", left no trace by morning. Every error-level log line and every failed page or route is
 * now also:
 *
 *   - recorded in the security log as `server-error`, with the route, the kind of error and its
 *     reference (already redacted: src/observability/redact.ts), at most once a minute for the same
 *     error on one server instance, so a flood records a sample, not a flood
 *   - emailed to tech@pjk.co.in (TECHNICAL_INBOX), at most once an hour for the same error and ten
 *     a day in all, so alerts never use up the sending allowance that sign-in codes need
 *
 * Never throws, and never reports its own failures (they are logged as warnings, which do not
 * come back here). Runs after the response where Next allows it (`after`), so a request is never
 * slowed down by it, and the work is not lost when the function is suspended.
 *
 * Production only, so development and test runs do not fill the log; a test can turn it on.
 */

type Report = { message: string; name?: string; route?: string; digest?: string }

const SINK = Symbol.for('pjk.errorSink')
type Holder = { [SINK]?: Payload }

/** Called once Payload is up (payload.config.ts onInit) */
export const reportErrorsTo = (payload: Payload) => {
  ;(globalThis as Holder)[SINK] = payload
}

let forced = false
/** For tests: report outside production too */
export const reportErrorsOutsideProduction = (on: boolean) => {
  forced = on
}
const enabled = () => forced || process.env.NODE_ENV === 'production'

const lastSeen = new Map<string, number>()
let busy = 0

export const reportServerError = (report: Report): void => {
  try {
    const payload = (globalThis as Holder)[SINK]
    if (!payload || !enabled() || busy > 0) return
    const message = String(report.message ?? '').slice(0, 300)
    const fingerprint = `${report.route ?? ''}|${report.name ?? ''}|${message.slice(0, 120)}`
    const now = Date.now()
    if (now - (lastSeen.get(fingerprint) ?? 0) < 60_000) return
    lastSeen.set(fingerprint, now)
    if (lastSeen.size > 500) lastSeen.clear()
    const work = record(payload, { ...report, message }, fingerprint)
    void import('next/server').then(({ after }) => after(work)).catch(() => undefined) // outside a request (a script, a cron run): it simply runs
  } catch {
    // Reporting must never break what is being reported
  }
}

const record = async (payload: Payload, report: Report, fingerprint: string) => {
  busy++
  try {
    const where = report.route ? `${report.route}: ` : ''
    const detail = `${where}${report.name ? `${report.name}: ` : ''}${report.message}${
      report.digest ? ` (reference ${report.digest})` : ''
    }`.slice(0, 500)
    await payload.create({
      collection: 'security-events',
      data: { event: 'server-error', detail },
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
    const { hitLimits } = await import('@/security/rateLimit')
    const limit = await hitLimits(payload, [
      { scope: 'error-alert', subject: fingerprint, max: 1, windowSeconds: 3600 },
      { scope: 'error-alert-day', subject: 'all', max: 10, windowSeconds: 86_400 },
    ])
    if (!limit.allowed) return
    const { sendTechnicalAlert } = await import('@/security/alerts')
    await sendTechnicalAlert(payload, {
      subject: `PJK site error${report.route ? ` on ${report.route}` : ''}`,
      lines: [
        `The site hit an error: ${detail}`,
        'It is recorded in Admin → Administration → Security log as "server-error". Vercel keeps its own logs for only an hour on this plan, so this email and that entry are the record.',
      ],
      note: 'You will not hear about this same error again for an hour, and about no more than ten errors a day.',
    })
  } catch (error) {
    payload.logger.warn({ msg: 'Could not record a server error', err: error })
  } finally {
    busy--
  }
}

/** The useful parts of what was handed to the logger at error level */
export const reportFromLogArgs = (args: unknown[]) => {
  const [first, second] = args
  let message = ''
  let name: string | undefined
  if (typeof first === 'string') message = first
  else if (first && typeof first === 'object') {
    const o = first as { msg?: unknown; message?: unknown; err?: unknown; name?: unknown }
    const err = (o.err ?? (first instanceof Error ? first : null)) as {
      name?: string
      type?: string
      message?: string
    } | null
    name = err?.type ?? err?.name ?? (typeof o.name === 'string' ? o.name : undefined)
    message =
      (typeof o.msg === 'string' && o.msg) ||
      (typeof second === 'string' && second) ||
      err?.message ||
      (typeof o.message === 'string' ? o.message : '')
  }
  if (message) reportServerError({ message, name })
}
