import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { SignOutButtons } from '@/components/account/SignOutButtons'
import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { MEMBER_COOKIE } from '@/security/constants'
import { readSession } from '@/security/memberSession'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

const STAGE_WORDS: Record<string, string> = {
  draft: 'Not sent yet',
  submitted: 'Sent; waiting to be read',
  'under-review': 'Being read',
  'changes-requested': 'We have asked for a few changes',
  approved: 'Approved',
  rejected: 'Not taken further',
}

/**
 * A member's own page: who they are to us, and where their applications have got to. Only for a
 * valid session; everyone else is sent to sign in. (Profiles, portfolios and payouts come later.)
 */
export default async function AccountPage() {
  const payload = await getPayload({ config: configPromise })
  const jar = await cookies()
  const active = await readSession(payload, jar.get(MEMBER_COOKIE)?.value)
  if (!active) redirect('/collaborate/signin')

  const { member } = active
  const applications = await payload.find({
    collection: 'applications',
    where: { member: { equals: member.id } },
    depth: 0,
    sort: 'createdAt',
    user: { ...member, collection: 'members' } as never,
    overrideAccess: false,
  })
  const has = (type: string) => applications.docs.some((a) => a.type === type)

  return (
    <OnboardingPage
      heading="Your account"
      intro={<>Signed in as {member.email}.</>}
      label="Members"
    >
      <section>
        <h2 className="display-sm">Member IDs</h2>
        <dl className="mt-4 grid gap-y-3 sm:grid-cols-[12rem_1fr]">
          <dt className="label pt-1">Artist</dt>
          <dd className="tracking-wider">
            {member.artistId ?? 'Issued when an artist application is approved'}
          </dd>
          <dt className="label pt-1">Partner</dt>
          <dd className="tracking-wider">
            {member.partnerId ?? 'Issued when a partner application is approved'}
          </dd>
        </dl>
      </section>

      <section className="mt-14 border-t border-border pt-8">
        <h2 className="display-sm">Applications</h2>
        {applications.docs.length === 0 && (
          <p className="muted mt-4">You have not started an application.</p>
        )}
        <ul className="mt-4">
          {applications.docs.map((app) => {
            const open = app.stage === 'draft' || app.stage === 'changes-requested'
            const href = app.type === 'artist' ? '/collaborate/artists' : '/collaborate/partners'
            return (
              <li
                className="grid gap-x-8 gap-y-2 border-b border-border py-6 sm:grid-cols-[12rem_1fr_auto]"
                key={app.id}
              >
                <span className="label pt-1">{app.type === 'artist' ? 'Artist' : 'Partner'}</span>
                <span>
                  <span className="block tracking-wider">{app.reference}</span>
                  <span className="muted block">{STAGE_WORDS[app.stage] ?? app.stage}</span>
                  {app.stage === 'changes-requested' && app.decisionNote && (
                    <span className="measure mt-3 block whitespace-pre-line">
                      {app.decisionNote}
                    </span>
                  )}
                </span>
                {open && (
                  <a className="link link-caps self-center" href={href}>
                    {app.stage === 'draft' ? 'Continue' : 'Make the changes'}
                  </a>
                )}
              </li>
            )
          })}
        </ul>
        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
          {!has('artist') && (
            <a className="link link-caps" href="/collaborate/artists">
              Apply as an artist
            </a>
          )}
          {!has('partner') && (
            <a className="link link-caps" href="/collaborate/partners">
              Apply as a partner
            </a>
          )}
        </div>
      </section>

      <section className="mt-14 border-t border-border pt-8">
        <SignOutButtons />
      </section>
    </OnboardingPage>
  )
}
