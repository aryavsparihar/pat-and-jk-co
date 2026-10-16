import type { Metadata } from 'next'
import React from 'react'

import { DriveGuide } from '@/components/portal/DriveGuide'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { WorksFolderForm } from '@/components/portal/WorksFolderForm'
import { WorksList } from '@/components/portal/WorksList'
import { loadArtist, thumbnailsOf } from '@/members/accountPage'
import { listOwnArtworks } from '@/members/artworks'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your works', robots: { index: false, follow: false } }

/**
 * The artist's works: the Google Drive folder their photos and videos are in, a folder per work,
 * and the description of each, in their order, with where each review stands
 */
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
      intro={
        <>
          Keep your photos and videos in one Google Drive folder, a folder for each work, and
          describe each work here. Our team looks at every one before it is shown through Phulhaar.
        </>
      }
    >
      <section className="mb-14 grid gap-y-10 border-b border-border pb-14">
        <WorksFolderForm initial={member.worksFolder ?? null} />
        <DriveGuide />
      </section>
      {saved && (
        <p className="mb-8 text-base text-primary" role="status">
          Saved, and sent to our team. We will email you once it is public, or if we would like a
          change.
        </p>
      )}
      <h2 className="display-sm">Your works</h2>
      <a className="btn btn-solid mb-10 mt-6 min-h-11" href="/account/works/new">
        Describe a work
      </a>
      <WorksList initial={works as never} thumbnails={thumbnails} />
    </PortalFrame>
  )
}
