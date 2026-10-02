import { defaultLoggerOptions } from 'payload'
import { pino, type DestinationStream, type Logger } from 'pino'

import { redact } from './redact'

/**
 * The one logger: Payload's, every plugin's and ours all go through it.
 *
 * In production it writes one JSON object per line, which Vercel's log viewer can filter; in
 * development it keeps Payload's readable coloured output. Either way, every argument passes
 * through `redact` before pino sees it, so personal data cannot reach a log by accident.
 */
export const createLogger = (destination?: DestinationStream): Logger => {
  const production = process.env.NODE_ENV === 'production'
  return pino(
    {
      name: 'payload',
      level: process.env.LOG_LEVEL || 'info',
      enabled: process.env.DISABLE_LOGGING !== 'true',
      base: production ? { env: process.env.VERCEL_ENV ?? 'production' } : undefined,
      hooks: {
        logMethod(args, method) {
          return method.apply(this, args.map((arg) => redact(arg)) as Parameters<typeof method>)
        },
      },
    },
    destination ?? (production ? undefined : defaultLoggerOptions),
  )
}
