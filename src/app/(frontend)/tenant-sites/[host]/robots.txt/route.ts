import { getTenantContext } from '@/utilities/tenant'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params
  const ctx = await getTenantContext(host)

  // Keep Vercel preview deployments out of search results
  if (process.env.VERCEL_ENV === 'preview' || !ctx) {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // Media files (images) are allowed so they can appear in Google Images and link previews
  const body = `User-agent: *\nAllow: /\nAllow: /api/media/file/\nDisallow: /admin\nDisallow: /api/\nDisallow: /next/\n\nSitemap: ${ctx.siteUrl}/sitemap.xml\n`
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } })
}
