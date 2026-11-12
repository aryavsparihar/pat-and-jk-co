import { createHash } from 'node:crypto'

import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

import { PRIVACY_POLICY_TITLE } from '@/legal/privacyPolicy'
import type { Page } from '@/payload-types'
import { clientIp } from '@/security/constants'
import { requestHostname } from '@/security/turnstile'
import { getPageBySlug } from '@/utilities/queries'
import { getTenantByHost } from '@/utilities/tenant'

import { DPDP_CHECKBOX, DPDP_NOTICE, DPDP_NOTICE_HEADING } from './dpdpNotice'

/**
 * The evidence of consent kept with every application sent (src/members/application.ts): the
 * privacy policy and pre-submission notice exactly as the applicant was shown them, with their
 * version and SHA-256, and where and when consent was given. Written by the server alone, and
 * locked: nobody can change a row once it is kept (src/collections/applicationFields.ts).
 */
export type ConsentEvidence = {
  ip: string
  location: string
  userAgent: string
  policyTitle: string
  policyVersion: string
  policyText: string
  policySha256: string
}

/** The country, region and city Vercel reads from the address. Coarse: never a street. */
export const coarseLocation = (headers: Headers): string => {
  const part = (name: string) => {
    const value = headers.get(name)?.trim()
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  const found = [
    part('x-vercel-ip-city'),
    part('x-vercel-ip-country-region'),
    part('x-vercel-ip-country'),
  ].filter(Boolean)
  return found.length ? found.join(', ') : 'Not known'
}

/** The published privacy policy page as plain text, as the consent box showed it */
const policyText = async (headers: Headers, fallbackHost: string): Promise<string> => {
  const tenant = await getTenantByHost(requestHostname(headers) ?? fallbackHost)
  const page = tenant ? ((await getPageBySlug(tenant.id, 'privacy', false)) as Page | null) : null
  const blocks = (page?.layout ?? []).flatMap((block) =>
    block.blockType === 'content'
      ? (block.columns ?? []).flatMap((column) => (column.richText ? [column.richText] : []))
      : [],
  )
  return blocks
    .map((data) => convertLexicalToPlaintext({ data: data as SerializedEditorState }).trim())
    .filter(Boolean)
    .join('\n\n')
}

/** Everything about the consent that the server, not the applicant, can vouch for */
export const consentEvidence = async (
  request: Request,
  policyVersion: string,
): Promise<ConsentEvidence> => {
  const headers = request.headers
  const policy = await policyText(headers, new URL(request.url).hostname)
  const text = [
    PRIVACY_POLICY_TITLE,
    policy || '(The privacy policy page could not be read when this was recorded.)',
    DPDP_NOTICE_HEADING,
    DPDP_NOTICE,
    DPDP_CHECKBOX,
  ].join('\n\n')
  return {
    ip: clientIp(headers),
    location: coarseLocation(headers),
    userAgent: (headers.get('user-agent') ?? '').slice(0, 500),
    policyTitle: PRIVACY_POLICY_TITLE,
    policyVersion,
    policyText: text,
    policySha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  }
}

/** One row of the consent record, for the moment the application was sent */
export const consentRow = (
  evidence: ConsentEvidence,
  given: { checked: boolean; typed: string | null | undefined },
) => ({
  submittedAt: new Date().toISOString(),
  consentChecked: given.checked,
  typed: (given.typed ?? '').trim().slice(0, 40),
  policyTitle: evidence.policyTitle,
  policyVersion: evidence.policyVersion,
  policySha256: evidence.policySha256,
  policyText: evidence.policyText,
  ip: evidence.ip,
  location: evidence.location,
  userAgent: evidence.userAgent,
})
