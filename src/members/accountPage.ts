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
  return { payload, member: active.member, session: active.session }
}

/** The same, for pages only an approved artist may see; anyone else goes to their overview */
export const loadArtist = async () => {
  const loaded = await loadMember()
  if (!loaded.member.artistId) redirect('/account')
  return loaded
}
