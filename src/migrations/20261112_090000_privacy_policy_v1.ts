import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { PRIVACY_POLICY_EFFECTIVE, privacyPolicyRichText } from '../legal/privacyPolicy'

/**
 * The founder's privacy policy V1, effective 12 November 2026 (sent 11 November with the two
 * agreements, its cross-references aligned with them), in place of the 4 November text on the PJK
 * privacy page: the text of its Text block and the date under the heading. The section panel and
 * everything else on the page are left as they are; the earlier text stays in the page's version
 * history. A database without the PJK brand or a privacy page is left alone.
 */
const TENANT = 'pjk'

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const tenant = (
    await payload.find({
      collection: 'tenants',
      where: { slug: { equals: TENANT } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  if (!tenant) return payload.logger.info('No PJK brand on this database: privacy page left alone.')
  const page = (
    await payload.find({
      collection: 'pages',
      where: { and: [{ slug: { equals: 'privacy' } }, { tenant: { equals: tenant.id } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
  ).docs[0]
  if (!page) return payload.logger.info('No privacy page on this database: left alone.')

  let replaced = false
  const layout = (page.layout ?? []).map((block) => {
    if (block.blockType === 'pageIntro')
      return { ...block, intro: `Effective ${PRIVACY_POLICY_EFFECTIVE}.` }
    if (block.blockType === 'content' && !replaced) {
      replaced = true
      return {
        ...block,
        sectionNav: true,
        columns: [
          { ...(block.columns?.[0] ?? {}), size: 'full', richText: privacyPolicyRichText() },
        ],
      }
    }
    return block
  })
  if (!replaced) return payload.logger.warn('The privacy page has no Text block: left alone.')

  await payload.update({
    collection: 'pages',
    id: page.id,
    data: { _status: 'published', layout: layout as never },
    draft: false,
    overrideAccess: true,
    context: { disableRevalidate: true },
    req,
  })
  payload.logger.info(`Published the privacy policy effective ${PRIVACY_POLICY_EFFECTIVE}.`)
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  payload.logger.info('Nothing to undo: the earlier policy is in the page’s version history.')
}
