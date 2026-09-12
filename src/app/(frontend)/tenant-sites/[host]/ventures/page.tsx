import type { Metadata } from 'next'

import { PageView, pageMetadata } from '@/components/PageView'

type Args = { params: Promise<{ host: string }> }

// /ventures is an ordinary CMS page (slug "ventures"); this file only exists because
// /ventures/[slug] claims the "ventures" segment.
export default async function VenturesIndex({ params }: Args) {
  const { host } = await params
  return <PageView host={host} slug="ventures" />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return pageMetadata(host, 'ventures')
}
