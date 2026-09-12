import type { Metadata } from 'next'

import { PageView, pageMetadata } from '@/components/PageView'

type Args = { params: Promise<{ host: string }> }

export default async function HomePage({ params }: Args) {
  const { host } = await params
  return <PageView host={host} slug="home" />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return pageMetadata(host, 'home')
}
