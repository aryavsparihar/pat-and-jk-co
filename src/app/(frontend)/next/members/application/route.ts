import { artistProblems, findOwnApplication } from '@/members/application'
import { reply, requireMember, withRefresh } from '@/members/http'

export const dynamic = 'force-dynamic'

/**
 * The signed-in member's own application of a kind, as they may see it: everything they wrote,
 * where it has got to, and the note from staff if changes were asked for. Never staff notes.
 */
export async function GET(request: Request) {
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth

  const type = new URL(request.url).searchParams.get('type')
  if (type !== 'artist' && type !== 'partner') {
    return reply({ message: 'Ask for the artist or the partner application.' }, { status: 400 })
  }
  const application = await findOwnApplication(payload, member, type, 1)
  if (!application) return withRefresh(reply({ application: null }), auth.refresh)

  return withRefresh(
    reply({
      application,
      remaining: type === 'artist' ? Object.keys(artistProblems(application)) : [],
    }),
    auth.refresh,
  )
}
