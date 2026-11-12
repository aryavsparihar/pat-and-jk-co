import type { Payload, Where } from 'payload'

import { hasSocialIcon } from '@/brands/socialIcons'
import type { SiteSetting, Tenant } from '@/payload-types'
import { officeLines } from '@/utilities/address'

/**
 * The sign-off at the foot of every email the site sends: the brand's name, its registered
 * office, its website and its own social accounts (PJK's, never a venture's), each with its
 * platform's mark. Read from Site settings, so it changes when they do.
 *
 * Never allowed to stop an email going out: if the settings cannot be read, the footer is empty.
 */
export type EmailFooter = {
  text: string
  html: string
  /** The parts, for the email template (src/email/layout.ts) to lay out itself */
  lines: string[]
  siteUrl: string | null
  socials: { platform: string; label: string; url: string; icon: boolean }[]
}

const EMPTY: EmailFooter = { text: '', html: '', lines: [], siteUrl: null, socials: [] }

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const SOCIAL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  behance: 'Behance',
  other: 'Website',
}

/** The marks drawn by `pnpm social:icons`, from the live site so they load in an inbox */
const iconUrl = (platform: string) =>
  `${(process.env.NEXT_PUBLIC_SERVER_URL || 'https://pjk.co.in').replace(/\/$/, '')}/brand/social/${platform}.png`

const socialsHtml = (socials: { platform: string; url: string }[]): string =>
  socials.length === 0
    ? ''
    : `
<p style="font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.55;color:#5f6660;margin:14px 0 0">
${socials
  .map(
    ({ platform, url }) =>
      `<a href="${escape(url)}" style="color:#0f2a18;text-decoration:none;white-space:nowrap;margin-right:18px">${
        hasSocialIcon(platform)
          ? `<img src="${iconUrl(platform)}" width="18" height="18" alt="" style="display:inline-block;border:0;vertical-align:middle;width:18px;height:18px" />&nbsp;`
          : ''
      }<span style="vertical-align:middle">${escape(SOCIAL_LABEL[platform] ?? platform)}</span></a>`,
  )
  .join('\n')}
</p>`

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
  settings:
    | (Pick<SiteSetting, 'siteName' | 'copyrightName' | 'office' | 'address' | 'mapUrl'> & {
        socials?: SiteSetting['socials']
      })
    | null,
  siteUrl?: string | null,
): EmailFooter => {
  const name = settings?.copyrightName || settings?.siteName
  const lines = officeLines(settings)
  if (!name && lines.length === 0) return EMPTY
  const socials = (settings?.socials ?? []).filter((s) => /^https:\/\//i.test(s.url ?? ''))

  const site = siteUrl?.replace(/^https?:\/\//, '')
  const text = [
    '',
    '—',
    name,
    ...lines,
    siteUrl,
    ...socials.map((s) => `${SOCIAL_LABEL[s.platform] ?? s.platform}: ${s.url}`),
  ].filter((l) => l !== undefined && l !== null)

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
</p>${socialsHtml(socials)}`

  return {
    text: text.join('\n'),
    html,
    lines: lines.map(String),
    siteUrl: siteUrl ?? null,
    socials: socials.map((s) => ({
      platform: s.platform,
      label: SOCIAL_LABEL[s.platform] ?? s.platform,
      url: s.url ?? '',
      icon: hasSocialIcon(s.platform),
    })),
  }
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
