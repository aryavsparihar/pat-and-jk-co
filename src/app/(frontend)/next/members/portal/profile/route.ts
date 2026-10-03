import { profileView, requireArtist, saveProfile } from '@/members/artworks'
import { profileSchema } from '@/members/forms/portal'
import { parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

/** The artist's profile: the working copy, and where its review stands */
export const GET = portalHandler('profile', async ({ member }) => {
  requireArtist(member)
  return { profile: profileView(member) }
})

/** Saves the profile and sends it for review; the approved version stays public meanwhile */
export const POST = portalHandler(
  'profile',
  async ({ payload, member, request }) => ({
    profile: await saveProfile(payload, member, await parseBody(request, profileSchema)),
  }),
  { limit: 30 },
)
