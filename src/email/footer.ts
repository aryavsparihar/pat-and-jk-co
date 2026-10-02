import type { Payload, Where } from 'payload'

import type { SiteSetting, Tenant } from '@/payload-types'
import { officeLines } from '@/utilities/address'

/**
 * The sign-off at the foot of every email the site sends: the brand's name, its registered
 * office and its website. Read from Site settings, so it changes when they do.
 *
 * Never allowed to stop an email going out: if the settings cannot be read, the footer is empty.
 */
export type EmailFooter = { text: string; html: string }

const EMPTY: EmailFooter = { text: '', html: '' }

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const findTenant = async (payload: Payload, tenantId?: number | null): Promise<Tenant | null> => {
  const where: Where = tenantId
    ? { id: { equals: tenantId } }
    : { slug: { equals: process.env.DEFAULT_TENANT_SLUG || 'pjk' } }
  const found = await payload.find({
    collection: 'tenants',
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}

export const footerFromSettings = (
  settings: Pick<
    SiteSetting,
    'siteName' | 'copyrightName' | 'office' | 'address' | 'mapUrl'
  > | null,
  siteUrl?: string | null,
): EmailFooter => {
  const name = settings?.copyrightName || settings?.siteName
  const lines = officeLines(settings)
  if (!name && lines.length === 0) return EMPTY

  const site = siteUrl?.replace(/^https?:\/\//, '')
  const text = ['', '—', name, ...lines, siteUrl].filter((l) => l !== undefined && l !== null)

  const html = `
<hr style="border:none;border-top:1px solid #d9d4c7;margin:36px 0 16px" />
<p style="font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.55;color:#5f6660;margin:0">
${[name, ...lines]
  .filter(Boolean)
  .map((l) => escape(String(l)))
  .join('<br />')}${
    siteUrl && site
      ? `<br /><a href="${escape(siteUrl)}" style="color:#0f2a18">${escape(site)}</a>`
      : ''
  }
</p>`

  return { text: text.join('\n'), html }
}

/** The footer for a brand (or the default brand, when none is given). */
export const emailFooter = async (
  payload: Payload,
  tenantId?: number | null,
): Promise<EmailFooter> => {
  try {
    const tenant = await findTenant(payload, tenantId)
    if (!tenant) return EMPTY
    const found = await payload.find({
      collection: 'site-settings',
      where: { tenant: { equals: tenant.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const domain = tenant.domains?.[0]?.domain
    const siteUrl =
      domain && !domain.endsWith('.localhost')
        ? `https://${domain}`
        : process.env.NEXT_PUBLIC_SERVER_URL || null
    return footerFromSettings(found.docs[0] ?? null, siteUrl)
  } catch (error) {
    payload.logger.warn({ err: error, msg: 'Could not build the email footer; sending without it' })
    return EMPTY
  }
}
