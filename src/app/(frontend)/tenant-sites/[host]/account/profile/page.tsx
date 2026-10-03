import type { Metadata } from 'next'
import React from 'react'

import { ContactForm, ProfileForm } from '@/components/portal/ProfileForm'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { loadArtist } from '@/members/accountPage'
import { profileView } from '@/members/artworks'
import { MEDIUMS } from '@/members/forms/schemas'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your profile', robots: { index: false, follow: false } }

/** The artist's public profile, which goes to review, and their contact details, which do not */
export default async function ProfilePage() {
  const { member } = await loadArtist()
  const profile = profileView(member)
  return (
    <PortalFrame
      current="/account/profile"
      heading="Your profile"
      intro={<>How you appear with your work. Our team looks at it before it is shown.</>}
    >
      <ProfileForm initial={profile as never} mediums={MEDIUMS} />
      <section className="mt-16 border-t border-border-strong pt-10">
        <h2 className="display-sm">Contact details</h2>
        <p className="muted measure mb-8 mt-2">
          For us only, never shown to the public. Changes take effect at once.
        </p>
        <ContactForm initial={profile.contact as never} />
      </section>
    </PortalFrame>
  )
}
