import { listSessions } from '@/members/account'
import { portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

/** Every device the member is signed in on */
export const GET = portalHandler('sessions', async ({ payload, member, session }) => ({
  sessions: await listSessions(payload, member, session),
}))
