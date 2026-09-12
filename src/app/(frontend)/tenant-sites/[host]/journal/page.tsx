import type { Metadata } from 'next'

import { PageView, pageMetadata } from '@/components/PageView'

type Args = { params: Promise<{ host: string }> }

// /journal is an ordinary CMS page (slug "journal"); this file only exists because
// /journal/[slug] claims the "journal" segment.
export default async function JournalIndex({ params }: Args) {
  const { host } = await params
  return <PageView host={host} slug="journal" />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return pageMetadata(host, 'journal')
}
