import type { Metadata } from 'next'
import React from 'react'

import { PortalFrame } from '@/components/portal/PortalFrame'
import { WorksList } from '@/components/portal/WorksList'
import { loadArtist, thumbnailsOf } from '@/members/accountPage'
import { listOwnArtworks } from '@/members/artworks'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your works', robots: { index: false, follow: false } }

/** The artist's works, in their order, with where each review stands */
export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const { payload, member } = await loadArtist()
  const [works, thumbnails, { saved }] = await Promise.all([
    listOwnArtworks(payload, member),
    thumbnailsOf(payload, member.id),
    searchParams,
  ])
  return (
    <PortalFrame
      current="/account/works"
      heading="Your works"
      intro={<>Shown through Phulhaar once our team has looked at them.</>}
    >
      {saved && (
        <p className="mb-8 text-base text-primary" role="status">
          Saved, and sent to our team. We will email you once it is public, or if we would like a
          change.
        </p>
      )}
      <a className="btn btn-solid mb-10 min-h-11" href="/account/works/new">
        Add a work
      </a>
      <WorksList initial={works as never} thumbnails={thumbnails} />
    </PortalFrame>
  )
}
