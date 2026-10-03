import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'

import { MEMBER_COOKIE } from '@/security/constants'
import { readSession } from '@/security/memberSession'

/** The signed-in member for an account page, or a redirect to sign in */
export const loadMember = async () => {
  const payload = await getPayload({ config: configPromise })
  const jar = await cookies()
  const active = await readSession(payload, jar.get(MEMBER_COOKIE)?.value)
  if (!active) redirect('/collaborate/signin')
  return { payload, member: active.member }
}

/** The same, for pages only an approved artist may see; anyone else goes to their overview */
export const loadArtist = async () => {
  const loaded = await loadMember()
  if (!loaded.member.artistId) redirect('/account')
  return loaded
}

/** Thumbnails of a member's own pictures, by id, for showing their works */
export const thumbnailsOf = async (
  payload: Awaited<ReturnType<typeof loadMember>>['payload'],
  memberId: number,
): Promise<Record<number, string | null>> => {
  const images = await payload.find({
    collection: 'portfolio-images',
    where: { owner: { equals: memberId } },
    limit: 2000,
    depth: 0,
    overrideAccess: true,
  })
  return Object.fromEntries(
    images.docs.map((i) => [i.id, i.sizes?.thumbnail?.url ?? i.url ?? null]),
  )
}
