import type { Metadata } from 'next'
import React from 'react'

import { PortalFrame } from '@/components/portal/PortalFrame'
import { WorkForm } from '@/components/portal/WorkForm'
import { loadArtist } from '@/members/accountPage'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Add a work', robots: { index: false, follow: false } }

export default async function NewWorkPage() {
  await loadArtist()
  return (
    <PortalFrame
      current="/account/works"
      heading="Add a work"
      intro={
        <>
          A few facts and a description. Its pictures and any video go in your Google Drive folder.
          Our team looks at it before it is shown.
        </>
      }
    >
      <WorkForm />
    </PortalFrame>
  )
}
