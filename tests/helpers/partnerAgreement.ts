import type { Payload } from 'payload'

/** The agreement's words, as Lexical stores them: one paragraph */
export const agreementText = (words: string) => ({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        textFormat: 0,
        children: [
          {
            type: 'text',
            version: 1,
            text: words,
            format: 0,
            mode: 'normal',
            detail: 0,
            style: '',
          },
        ],
      },
    ],
  },
})

const where = { 'tenant.slug': { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } }

/**
 * Publishes the Partner/Trade Program agreement on the default brand (Site settings →
 * Applications), or with null takes it down, as before the founder supplies it. Returns what puts
 * back the agreement that was there before, so a real one in a local database survives the tests.
 */
export const setPartnerAgreement = async (
  payload: Payload,
  agreement: { version: string; words: string } | null,
): Promise<() => Promise<void>> => {
  const before = (
    await payload.find({
      collection: 'site-settings',
      where,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0]?.partnerAgreement
  const write = (value: unknown) =>
    payload.update({
      collection: 'site-settings',
      where,
      data: { partnerAgreement: value } as never,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })
  await write(
    agreement
      ? { version: agreement.version, text: agreementText(agreement.words) }
      : { version: null, text: null },
  )
  return async () => {
    await write(before ?? { version: null, text: null })
  }
}
