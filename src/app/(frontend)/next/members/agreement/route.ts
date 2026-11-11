import { agreementStatus, issueAgreementCode, signAgreement } from '@/agreements/service'
import {
  fromOurOrigin,
  readJson,
  refuseCrossSite,
  reply,
  requireMember,
  withRefresh,
} from '@/members/http'
import { requireRecentSignIn } from '@/members/recent'
import { clientIp } from '@/security/constants'
import { hitLimit } from '@/security/rateLimit'

import { agreementFor, agreementProblem } from './shared'

export const dynamic = 'force-dynamic'

/**
 * Signing the artist or trade agreement (src/agreements/service.ts). The member is signed in, and
 * every call carries the ID issued to them on approval, checked against their account.
 *   GET  ?kind=artist|partner&id=AT-XXXXX   who they are, as the agreement will name them, and
 *                                           how far signing has gone
 *   POST { kind, id, action: 'code' }       a new ten-minute code
 *   POST { kind, id, action: 'sign', ... }  sign, once the live photo is in (./photo)
 */
export async function GET(request: Request) {
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const found = agreementFor(auth.member, url.searchParams.get('kind'), url.searchParams.get('id'))
  if ('refused' in found) return found.refused
  const status = await agreementStatus(auth.payload, auth.member, found.agreement)
  return withRefresh(
    reply(
      { ...status, ip: clientIp(request.headers) },
      { headers: { 'Cache-Control': 'no-store' } },
    ),
    auth.refresh,
  )
}

export async function POST(request: Request) {
  if (!fromOurOrigin(request)) return refuseCrossSite()
  const auth = await requireMember(request)
  if (!auth.ok) return auth.response
  const { payload, member } = auth
  // Signing is done with a sign-in from the last 30 minutes, as identity details are
  const stale = requireRecentSignIn(auth.session)
  if (stale) return stale

  const body = await readJson<Record<string, unknown>>(request)
  const found = agreementFor(member, body?.kind, body?.id)
  if ('refused' in found) return found.refused

  const limit = await hitLimit(payload, {
    scope: 'agreement',
    subject: String(member.id),
    max: 40,
    windowSeconds: 3600,
  })
  if (!limit.allowed)
    return reply({ message: 'Please wait a little before trying again.' }, { status: 429 })

  try {
    if (body?.action === 'code') {
      const issued = await issueAgreementCode(payload, member, found.agreement)
      return withRefresh(reply(issued), auth.refresh)
    }
    if (body?.action === 'sign') {
      const signed = await signAgreement(payload, member, found.agreement, {
        typed: body.typed,
        agreedTerms: body.agreedTerms,
        agreedPrivacy: body.agreedPrivacy,
        firm: body.firm,
        firmRegistration: body.firmRegistration,
        address: body.address,
        ip: clientIp(request.headers),
        userAgent: request.headers.get('user-agent') ?? '',
      })
      return withRefresh(reply(signed, { status: 201 }), auth.refresh)
    }
    return reply({ message: 'What should be done?' }, { status: 400 })
  } catch (error) {
    const problem = agreementProblem(error)
    if (problem) return problem
    payload.logger.error({ err: error, msg: 'Signing an agreement failed' })
    return reply({ message: 'That did not work. Please try again.' }, { status: 500 })
  }
}
