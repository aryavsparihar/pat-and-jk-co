import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { PortalFrame } from '@/components/portal/PortalFrame'
import { WorkForm } from '@/components/portal/WorkForm'
import { loadArtist } from '@/members/accountPage'
import { listOwnArtworks } from '@/members/artworks'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Edit a work', robots: { index: false, follow: false } }

/** One of the artist's own works; anyone else's is not found */
export default async function EditWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { payload, member } = await loadArtist()
  const id = Number((await params).id)
  const work = (await listOwnArtworks(payload, member)).find((w) => w.id === id)
  if (!work) notFound()
  return (
    <PortalFrame
      current="/account/works"
      heading={work.title}
      intro={<>Changes go to our team before they are shown.</>}
    >
      <WorkForm initial={work as never} />
    </PortalFrame>
  )
}
