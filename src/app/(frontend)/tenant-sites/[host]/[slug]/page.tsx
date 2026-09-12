import type { Metadata } from 'next'

import { PageView, pageMetadata } from '@/components/PageView'
import { getAllSlugs } from '@/utilities/queries'
import { getTenantByHost } from '@/utilities/tenant'

type Args = { params: Promise<{ host: string; slug: string }> }

export async function generateStaticParams({ params }: { params: { host: string } }) {
  const tenant = await getTenantByHost(params.host).catch(() => null)
  if (!tenant) return []
  const slugs = await getAllSlugs('pages', tenant.id)
  return slugs.filter((slug) => slug !== 'home').map((slug) => ({ slug }))
}

export default async function Page({ params }: Args) {
  const { host, slug } = await params
  return <PageView host={host} slug={decodeURIComponent(slug)} />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host, slug } = await params
  return pageMetadata(host, decodeURIComponent(slug))
}
