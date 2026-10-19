import type { Metadata } from 'next'
import React from 'react'

import { DriveGuide } from '@/components/portal/DriveGuide'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { WorksFolderForm } from '@/components/portal/WorksFolderForm'
import { loadArtist } from '@/members/accountPage'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your works', robots: { index: false, follow: false } }

/**
 * The artist's works: the one Google Drive folder they are all in, a folder per work holding its
 * photos, any video and its description, and how to set it out. Nothing about the works is kept
 * on the site itself; our team reads the folder.
 */
export default async function WorksPage() {
  const { member } = await loadArtist()
  return (
    <PortalFrame
      current="/account/works"
      heading="Your works"
      intro={
        <>
          Keep everything about your works in one Google Drive folder: a folder for each work, with
          its photos, any video and its description. Our team looks at every one before it is shown
          through Phulhaar.
        </>
      }
    >
      <section className="grid gap-y-10">
        <WorksFolderForm initial={member.worksFolder ?? null} />
        <DriveGuide />
      </section>
    </PortalFrame>
  )
}
