import type { Metadata } from 'next'

import React from 'react'

import { BrandSvg } from '@/components/brand/BrandSvg'
import { COMPANY_EMAIL_DOMAIN } from '@/security/constants'

import { GateForm } from './GateForm'

export const metadata: Metadata = {
  title: 'Admin sign-in',
  robots: { index: false, follow: false },
}

type Args = { searchParams: Promise<{ next?: string }> }

/** The door to the admin panel: company mailbox first, then Payload's own sign-in. */
export default async function AdminAccessPage({ searchParams }: Args) {
  const { next } = await searchParams
  // Only ever send people back into this site, never to an address supplied in the URL
  const destination = next && /^\/admin(\/|$)/.test(next) ? next : '/admin'

  return (
    <main className="container flex min-h-screen items-center py-16">
      <div className="mx-auto w-full max-w-xl">
        <BrandSvg className="w-40 text-primary" name="logo" title="PAT and J.K. Co." />

        <h1 className="display-md mt-10">Admin sign-in</h1>
        <p className="measure mt-4">
          The admin panel is for PAT and J.K. Co. staff. Enter your work address and we will email
          you a one-time code; your password is asked for afterwards.
        </p>

        <GateForm domain={COMPANY_EMAIL_DOMAIN} next={destination} />

        <p className="muted mt-14 border-t border-border pt-6 text-base">
          Codes expire after ten minutes and can be used once. Every attempt is recorded.
        </p>
      </div>
    </main>
  )
}
