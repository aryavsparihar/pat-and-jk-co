import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Fills in what the previous migration made room for: Phulhaar's own mark, the line about the
 * garland, and the opening on 8 November 2026. Content normally belongs in the admin panel, but
 * this brand's website was already live when the fields were added, and a deploy is the one
 * place this code can reach the production database and blob store.
 *
 * It only ever fills a field that is empty, so nothing anyone writes in the admin is disturbed,
 * and it runs once like any other migration. Every step is optional: a failure here is logged
 * and swallowed, because a missing caption is not a reason to fail a deployment.
 */

const LOGO = 'public/brand/ventures/phulhaar-logo.png'
const SLUG = 'phulhaar-gallery'

const CAPTION = `A phulhaar is a garland. Every artist it gathers is a bloom of their own, and the gallery is the thread that draws them into a single piece of work.

A space of vibrant artistry, anchored in quiet light.`

export async function up({ payload }: MigrateUpArgs): Promise<void> {
  try {
    const found = await payload.find({
      collection: 'ventures',
      where: { slug: { equals: SLUG } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })

    const venture = found.docs[0]
    if (!venture) {
      payload.logger.info(`No “${SLUG}” venture on this database — nothing to fill in.`)
      return
    }

    const data: Record<string, unknown> = {}
    if (!venture.caption) data.caption = CAPTION
    if (!venture.opening?.date) {
      data.opening = { date: '2026-11-08T00:00:00.000Z', note: 'in celebration of Diwali' }
    }

    // Uploading needs somewhere to put the file. Without the blob store the media row would
    // point at a file that only exists on the machine that ran this, which is worse than no logo.
    const file = path.resolve(process.cwd(), LOGO)
    const canUpload =
      Boolean(process.env.BLOB_READ_WRITE_TOKEN) || process.env.NODE_ENV !== 'production'

    if (!venture.logo && existsSync(file) && canUpload) {
      const bytes = readFileSync(file)
      const media = await payload.create({
        collection: 'media',
        data: { alt: 'Phulhaar Gallery by PJK', tenant: venture.tenant as never },
        file: {
          data: bytes,
          mimetype: 'image/png',
          name: path.basename(LOGO),
          size: bytes.length,
        },
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
      data.logo = media.id
    }

    if (Object.keys(data).length === 0) {
      payload.logger.info('Phulhaar already has its mark and opening — left alone.')
      return
    }

    await payload.update({
      collection: 'ventures',
      id: venture.id,
      data,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })

    payload.logger.info(`Filled in for Phulhaar: ${Object.keys(data).join(', ')}.`)
  } catch (error) {
    payload.logger.warn(
      `Could not fill in Phulhaar's mark and opening; set them in the admin instead. ${String(error)}`,
    )
  }
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // Content, not schema. Rolling the database back should not delete what an editor has since
  // written, so this deliberately does nothing.
  payload.logger.info('Nothing to undo: this migration only added content.')
}
