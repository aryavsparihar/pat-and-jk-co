import type { Metadata } from 'next'

import type { Media, Page, Post, Venture } from '@/payload-types'

import type { TenantContext } from './tenant'

type Doc = Partial<Page> | Partial<Post> | Partial<Venture>

const imageUrl = (siteUrl: string, image: unknown): string | null => {
  if (!image || typeof image !== 'object' || !('url' in image)) return null
  const media = image as Media
  const url = media.sizes?.og?.url || media.url
  if (!url) return null
  return url.startsWith('http') ? url : `${siteUrl}${url}`
}

/** Collapses stray whitespace (a tab pasted into the admin, a double space) */
const tidy = (value?: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim()

const namesSite = (title: string, siteName: string): boolean =>
  Boolean(siteName) && title.toLowerCase().includes(siteName.toLowerCase())

/**
 * Page metadata for a brand: title, description, canonical URL and social preview image.
 * Falls back through the page's SEO tab → brand site settings → the default PJK share image.
 */
export const generateMeta = ({
  ctx,
  doc,
  path,
}: {
  ctx: TenantContext | null
  doc?: Doc | null
  path: string
}): Metadata => {
  const settings = ctx?.settings
  if (!doc) return { title: 'Page not found', robots: { index: false } }

  const siteUrl = ctx?.siteUrl ?? ''
  const siteName = settings?.siteName ?? 'PAT and J.K. Co.'

  const docTitle = tidy(
    doc?.meta?.title ||
      (doc && 'name' in doc ? doc.name : doc && 'title' in doc ? doc.title : undefined),
  )
  const isHome = path === '/'
  // An SEO title that already names the site ("… | PAT and J.K. Co.") is used as written, rather
  // than having the layout's "— PAT and J.K. Co." appended a second time
  const title = isHome
    ? {
        absolute:
          tidy(doc?.meta?.title) || [siteName, settings?.tagline].filter(Boolean).join(' — '),
      }
    : namesSite(docTitle, siteName)
      ? { absolute: docTitle }
      : docTitle

  const description =
    tidy(
      doc?.meta?.description ||
        (doc && 'excerpt' in doc ? doc.excerpt : undefined) ||
        (doc && 'summary' in doc ? doc.summary : undefined) ||
        settings?.description,
    ) || undefined

  const image =
    imageUrl(siteUrl, doc?.meta?.image) ||
    imageUrl(siteUrl, settings?.ogImage) ||
    `${siteUrl}/brand/og-default.png`

  const url = `${siteUrl}${path === '/' ? '' : path}` || '/'

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: doc && 'content' in doc && 'publishedAt' in doc ? 'article' : 'website',
      siteName,
      title: typeof title === 'string' ? `${title} — ${siteName}` : title.absolute,
      description: description ?? undefined,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
      locale: 'en_IN',
    },
    twitter: {
      card: 'summary_large_image',
    },
  }
}
