import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { PRIVACY_POLICY_EFFECTIVE, privacyPolicyRichText } from '../legal/privacyPolicy'

/**
 * The founder's privacy policy of 4 November 2026 on the privacy page: its full text in one Text
 * block, the title as its first heading, the section headings listed in the left margin (the new
 * "section panel" option), and the date under the page heading. The earlier policy stays in the
 * page's version history. A database without the PJK brand or a privacy page is left alone.
 */
const TENANT = 'pjk'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_content" ADD COLUMN "section_nav" boolean DEFAULT false;
  ALTER TABLE "_pages_v_blocks_content" ADD COLUMN "section_nav" boolean DEFAULT false;`)

  const tenants = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: TENANT } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const tenant = tenants.docs[0]
  if (!tenant) return payload.logger.info('No PJK brand on this database: privacy page left alone.')
  const pages = await payload.find({
    collection: 'pages',
    where: { and: [{ slug: { equals: 'privacy' } }, { tenant: { equals: tenant.id } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const page = pages.docs[0]
  if (!page) return payload.logger.info('No privacy page on this database: left alone.')

  const intro = (page.layout ?? []).find((block) => block.blockType === 'pageIntro')
  await payload.update({
    collection: 'pages',
    id: page.id,
    data: {
      _status: 'published',
      layout: [
        {
          ...(intro ?? { blockType: 'pageIntro', align: 'left', eyebrow: 'Legal' }),
          heading: intro?.heading || 'Privacy policy',
          intro: `Effective ${PRIVACY_POLICY_EFFECTIVE}.`,
        },
        {
          blockType: 'content',
          sectionNav: true,
          width: 'narrow',
          columns: [
            {
              size: 'full',
              richText: privacyPolicyRichText(),
            },
          ],
        },
      ] as never,
    },
    draft: false,
    overrideAccess: true,
    context: { disableRevalidate: true },
    req,
  })
  payload.logger.info(`Published the privacy policy effective ${PRIVACY_POLICY_EFFECTIVE}.`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_content" DROP COLUMN "section_nav";
  ALTER TABLE "_pages_v_blocks_content" DROP COLUMN "section_nav";`)
}
