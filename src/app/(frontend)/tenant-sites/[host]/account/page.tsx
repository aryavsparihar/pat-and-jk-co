import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { ApplyAgainButton, WithdrawButton } from '@/components/account/ApplicationActions'
import { SignOutButtons } from '@/components/account/SignOutButtons'
import { DeclinedNotice } from '@/components/onboarding/DeclinedNotice'
import { PhulhaarPage } from '@/components/phulhaar/PhulhaarPage'
import { phulhaarSocialLinks } from '@/brands/socialIcons'
import { defaultSiteSettings } from '@/members/openness'
import { canReapply } from '@/members/reapply'
import { STAGE_WORDS, WITHDRAWABLE } from '@/members/stages'
import type { Application } from '@/payload-types'
import { ContactForm } from '@/components/portal/ProfileForm'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { listOwnArtworks, profileView } from '@/members/artworks'
import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { MEMBER_COOKIE } from '@/security/constants'
import { readSession } from '@/security/memberSession'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
}

const shortDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : ''

/**
 * A member's own page. What it shows depends on who they are to us:
 *
 *   an approved artist    the portal: profile, works, payouts and account (src/components/portal)
 *   an approved partner   their standing, PT ID and contact details, nothing more
 *   an applicant          where their applications have got to, and nothing more; when their
 *                         artist application was declined, that news in Phulhaar's style
 *
 * Each person has at most one current application of each kind (the newest); earlier ones, from
 * before they applied again, are listed beneath it.
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
    sort: '-createdAt',
    limit: 100,
    user: { ...member, collection: 'members' } as never,
    overrideAccess: false,
  })
  const has = (type: string) => applications.docs.some((a) => a.type === type)
  const current = (['artist', 'partner'] as const)
    .map((type) => applications.docs.find((a) => a.type === type))
    .filter((a): a is Application => Boolean(a))
  const earlier = applications.docs.filter((a) => !current.includes(a))
  const contact = profileView(member).contact
  const settings = await defaultSiteSettings(payload)
  const socials = phulhaarSocialLinks(settings?.phulhaarSocial)

  const declined = (app: Application) => (
    <DeclinedNotice
      action={canReapply(app) ? <ApplyAgainButton kind={app.type} /> : undefined}
      headingLevel="h3"
      kind={app.type}
      note={app.decisionNote}
      reapplyFrom={app.reapplyFrom}
      ready={canReapply(app)}
      reference={app.reference}
      socials={socials}
    />
  )

  const applicationsSection = (
    <section className="mt-14 border-t border-border pt-8">
      <h2 className="display-sm">Applications</h2>
      {applications.docs.length === 0 && (
        <p className="muted mt-4">You have not started an application.</p>
      )}
      <ul className="mt-4">
        {current.map((app) => {
          const open = app.stage === 'draft' || app.stage === 'changes-requested'
          const href = app.type === 'artist' ? '/collaborate/artists' : '/collaborate/partners'
          if (app.stage === 'rejected') {
            return (
              <li className="border-b border-border py-8" key={app.id}>
                {declined(app)}
              </li>
            )
          }
          return (
            <li
              className="grid gap-x-8 gap-y-2 border-b border-border py-6 sm:grid-cols-[12rem_1fr_auto]"
              key={app.id}
            >
              <span className="label pt-1">{app.type === 'artist' ? 'Artist' : 'Partner'}</span>
              <span>
                <span className="block tracking-wider">{app.reference}</span>
                <span className="muted block">
                  {STAGE_WORDS[app.stage] ?? app.stage}
                  {app.stage === 'withdrawn' && app.withdrawnAt
                    ? `, ${shortDate(app.withdrawnAt)}`
                    : ''}
                </span>
                {app.stage === 'changes-requested' && app.decisionNote && (
                  <span className="measure mt-3 block whitespace-pre-line">{app.decisionNote}</span>
                )}
                {app.stage === 'withdrawn' && (
                  <span className="mt-4 block">
                    <ApplyAgainButton kind={app.type} />
                  </span>
                )}
              </span>
              <span className="flex flex-col items-start gap-1 self-center sm:items-end">
                {open && (
                  <a className="link link-caps min-h-11 content-center" href={href}>
                    {app.stage === 'draft' ? 'Continue' : 'Make the changes'}
                  </a>
                )}
                {WITHDRAWABLE.includes(app.stage) && (
                  <WithdrawButton kind={app.type} reference={app.reference} />
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {earlier.length > 0 && (
        <div className="mt-10">
          <h3 className="label">Earlier applications</h3>
          <ul className="mt-3">
            {earlier.map((app) => (
              <li
                className="grid gap-x-8 gap-y-1 border-b border-border py-4 sm:grid-cols-[12rem_1fr]"
                key={app.id}
              >
                <span className="muted">{app.type === 'artist' ? 'Artist' : 'Partner'}</span>
                <span>
                  <span className="tracking-wider">{app.reference}</span>
                  <span className="muted">
                    {' '}
                    · {STAGE_WORDS[app.stage] ?? app.stage}
                    {app.decidedAt || app.withdrawnAt
                      ? `, ${shortDate(app.withdrawnAt ?? app.decidedAt)}`
                      : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
  )

  if (member.artistId) {
    const works = await listOwnArtworks(payload, member)
    const waiting = works.filter((w) => w.review.state === 'pending').length
    const changes = works.filter((w) => w.review.state === 'changes-requested').length
    const shown = works.filter((w) => w.isPublic).length
    const profile = profileView(member)
    return (
      <PortalFrame
        current="/account"
        heading="Your account"
        intro={<>Signed in as {member.email}.</>}
      >
        <section>
          <h2 className="display-sm">Member IDs</h2>
          <dl className="mt-4 grid gap-y-3 sm:grid-cols-[12rem_1fr]">
            <dt className="label pt-1">Artist</dt>
            <dd className="tracking-wider">{member.artistId}</dd>
            {member.partnerId && (
              <>
                <dt className="label pt-1">Partner</dt>
                <dd className="tracking-wider">{member.partnerId}</dd>
              </>
            )}
          </dl>
        </section>
        <section className="mt-14 border-t border-border pt-8">
          <h2 className="display-sm">Where things stand</h2>
          <ul className="measure mt-4 grid gap-y-2">
            <li>
              Your profile:{' '}
              {profile.review.state === 'pending'
                ? 'waiting for our review.'
                : profile.review.state === 'changes-requested'
                  ? 'we have asked for a few changes.'
                  : profile.isPublic
                    ? 'public.'
                    : 'not sent yet.'}{' '}
              <a className="link" href="/account/profile">
                {profile.isPublic ? 'Edit' : 'Fill it in'}
              </a>
            </li>
            <li>
              Your works: {works.length === 0 ? 'none yet' : `${shown} public`}
              {waiting ? `, ${waiting} waiting for review` : ''}
              {changes ? `, ${changes} with changes asked for` : ''}.{' '}
              <a className="link" href={works.length ? '/account/works' : '/account/works/new'}>
                {works.length ? 'See them' : 'Add your first'}
              </a>
            </li>
          </ul>
        </section>
        <section className="mt-14 border-t border-border pt-8">
          <SignOutButtons />
        </section>
      </PortalFrame>
    )
  }

  if (member.partnerId) {
    return (
      <OnboardingPage
        heading="Your account"
        intro={<>Signed in as {member.email}.</>}
        label="Partners"
      >
        <section>
          <h2 className="display-sm">Partner</h2>
          <dl className="mt-4 grid gap-y-3 sm:grid-cols-[12rem_1fr]">
            <dt className="label pt-1">Member ID</dt>
            <dd className="tracking-wider">{member.partnerId}</dd>
            <dt className="label pt-1">Standing</dt>
            <dd>
              {member.standing === 'active' ? 'Approved partner' : 'Suspended'}
              {member.partnerApprovedAt
                ? `, since ${new Date(member.partnerApprovedAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}`
                : ''}
            </dd>
          </dl>
        </section>
        <section className="mt-14 border-t border-border pt-8">
          <h2 className="display-sm mb-6">Contact details</h2>
          <ContactForm initial={contact as never} />
        </section>
        {applications.docs.some((a) => a.type === 'artist') && applicationsSection}
        <section className="mt-14 border-t border-border pt-8">
          <SignOutButtons />
        </section>
      </OnboardingPage>
    )
  }

  // Someone whose artist application was not accepted hears it in Phulhaar's own voice and style
  const artist = current.find((a) => a.type === 'artist')
  if (artist?.stage === 'rejected') {
    const others = current.filter((a) => a !== artist)
    return (
      <PhulhaarPage
        heading="Your application"
        intro={<>Signed in as {member.email}.</>}
        label="Your account"
      >
        {declined(artist)}
        {(others.length > 0 || earlier.length > 0) && applicationsSection}
        <section className="mt-14 border-t border-border pt-8">
          <SignOutButtons />
        </section>
      </PhulhaarPage>
    )
  }

  return (
    <OnboardingPage
      heading="Your account"
      intro={<>Signed in as {member.email}.</>}
      label="Members"
    >
      {applicationsSection}
      <section className="mt-14 border-t border-border pt-8">
        <SignOutButtons />
      </section>
    </OnboardingPage>
  )
}
