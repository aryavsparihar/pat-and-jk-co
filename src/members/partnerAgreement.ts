import { createHash } from 'node:crypto'
import type { Payload } from 'payload'

import type { SiteSetting } from '@/payload-types'

/**
 * The Partner/Trade Program agreement, written in Site settings → Applications. A partner reads it
 * to its end, confirms and types I AGREE before sending their application; the version they agreed
 * to, and a digest of the words it then had, are kept with the application. Until both the text
 * and a version are given there, it is not published, and no partner application can be sent.
 */

export type PartnerAgreement = {
  title: string
  version: string
  /** The rich text, for the dialog */
  text: NonNullable<NonNullable<SiteSetting['partnerAgreement']>['text']>
  /** SHA-256 of its words, so the exact text agreed to can be told apart from a later edit */
  digest: string
}

type LexicalNode = { text?: unknown; children?: LexicalNode[] }

/** Every word in the agreement, in order, without its formatting */
export const plainText = (node: LexicalNode | null | undefined): string => {
  if (!node) return ''
  const own = typeof node.text === 'string' ? node.text : ''
  const inner = (node.children ?? []).map(plainText).filter(Boolean).join(' ')
  return [own, inner].filter(Boolean).join(' ')
}

export const partnerAgreement = async (payload: Payload): Promise<PartnerAgreement | null> => {
  const settings = (
    await payload.find({
      collection: 'site-settings',
      where: { 'tenant.slug': { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as SiteSetting | undefined
  const agreement = settings?.partnerAgreement
  const version = agreement?.version?.trim()
  const words = plainText(agreement?.text?.root as LexicalNode | undefined)
    .replace(/\s+/g, ' ')
    .trim()
  if (!agreement?.text || !version || !words) return null
  return {
    title: agreement.title?.trim() || 'Partner/Trade Program agreement',
    version,
    text: agreement.text,
    digest: createHash('sha256').update(words).digest('hex'),
  }
}
