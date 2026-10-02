import type { Instrumentation } from 'next'

/**
 * Next.js calls this for every error thrown while rendering a page or running a route handler.
 * It becomes one structured, redacted log line: the path without its query string (queries can
 * carry anything), what kind of route failed, and the error with personal data removed.
 *
 * Next also prints the raw error itself; the rule that keeps that safe is that our own error
 * messages never contain personal data in the first place (see docs/SECURITY.md).
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { redact } = await import('./observability/redact')
  const err = error as Error & { digest?: string }

  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'request failed',
      method: request.method,
      path: request.path.split('?')[0],
      route: context.routePath,
      routeType: context.routeType,
      digest: err.digest,
      error: redact({ name: err.name, message: err.message, stack: err.stack }),
    }),
  )
}
