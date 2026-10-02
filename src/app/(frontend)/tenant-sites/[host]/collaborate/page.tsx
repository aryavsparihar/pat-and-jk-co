import type { Metadata } from 'next'

import { PageView, pageMetadata } from '@/components/PageView'

type Args = { params: Promise<{ host: string }> }

// /collaborate is an ordinary CMS page (slug "collaborate"); this file only exists because the
// onboarding pages beneath it (/collaborate/artists, /partners, /signin) claim the segment.
export default async function CollaborateIndex({ params }: Args) {
  const { host } = await params
  return <PageView host={host} slug="collaborate" />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return pageMetadata(host, 'collaborate')
}
