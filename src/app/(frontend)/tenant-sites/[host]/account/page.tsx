import type { Metadata } from 'next'
import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import {
  ApplyAgainButton,
  DeleteDraftButton,
  WithdrawButton,
} from '@/components/account/ApplicationActions'
import { SignOutButtons } from '@/components/account/SignOutButtons'
import { DeclinedNotice } from '@/components/onboarding/DeclinedNotice'
import { PhulhaarPage } from '@/components/phulhaar/PhulhaarPage'
import { phulhaarSocialLinks } from '@/brands/socialIcons'
import { defaultSiteSettings } from '@/members/openness'
import { canReapply } from '@/members/reapply'
import { STAGE_WORDS, WITHDRAWABLE } from '@/members/stages'
import { applicationStatus } from '@/members/status'
import type { Application } from '@/payload-types'
import { ContactForm } from '@/components/portal/ProfileForm'
import { PortalFrame } from '@/components/portal/PortalFrame'
import { profileView } from '@/members/profile'
import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { AccountSwitcher } from '@/components/portal/AccountSwitcher'
import { VIEW_COOKIE, chooseView } from '@/members/accountView'
import { MEMBER_COOKIE } from '@/security/constants'
import { readSession } from '@/security/memberSession'


type MemberApplication = Application & { type: 'artist' | 'partner' }

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
 *   both, on one email    whichever of the two they chose with "Your Account"
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
  // A member's own applications are an artist's or a partner's; a guest curator has no account
  const docs = applications.docs.filter((a): a is MemberApplication => a.type !== 'curator')
  const has = (type: string) => docs.some((a) => a.type === type)
  const current = (['artist', 'partner'] as const)
    .map((type) => docs.find((a) => a.type === type))
    .filter((a): a is MemberApplication => Boolean(a))
  const earlier = docs.filter((a) => !current.includes(a))
  const contact = profileView(member).contact
  const settings = await defaultSiteSettings(payload)
  const socials = phulhaarSocialLinks(settings?.phulhaarSocial)

  const declined = (app: MemberApplication) => (
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

  // Where the identity check has got to: one record per person, whichever kind it is for
  const identityRecord = (
    await payload.find({
      collection: 'kyc-records',
      where: { member: { equals: member.id } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  const identity = {
    sent: Boolean(identityRecord?.identityCheck?.sentAt),
    checked: Boolean(identityRecord?.identityCheck?.checkedAt),
  }
  const label = (type: 'artist' | 'partner') => (type === 'artist' ? 'Artist' : 'Trade account')
  const notStarted = (['artist', 'partner'] as const).filter((type) => !has(type))
  const startLinks = (
    <>
      {notStarted.includes('artist') && (
        <a className="link link-caps" href="/collaborate/artists">
          Apply as an artist
        </a>
      )}
      {notStarted.includes('partner') && (
        <a className="link link-caps" href="/collaborate/partners">
          Apply for a trade account
        </a>
      )}
    </>
  )

  const applicationsSection = (
    <section className="mt-14 border-t border-border pt-8">
      <h2 className="display-sm">Your applications</h2>
      {docs.length === 0 ? (
        <>
          <p className="measure mt-4">You have not started an application.</p>
          <p className="muted measure mt-2">
            Artists apply to show and sell through Phulhaar Gallery. Designers, architects and art
            advisers apply for a trade account.
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">{startLinks}</div>
        </>
      ) : (
        <p className="muted measure mt-3">
          Each application has its own number: AA- for artists, PA- for trade partners. If we work
          together, you receive a member ID (AT- or PT-) once the agreement is signed.
        </p>
      )}
      <ul className="mt-4">
        {current.map((app) => {
          if (app.stage === 'rejected') {
            return (
              <li className="border-b border-border py-8" key={app.id}>
                {declined(app)}
              </li>
            )
          }
          const status = applicationStatus(app, member, identity)
          return (
            <li
              className="grid gap-x-8 gap-y-2 border-b border-border py-6 sm:grid-cols-[12rem_1fr_auto]"
              key={app.id}
            >
              <span className="pt-1">
                <span className="label block">{label(app.type)}</span>
                <span className="block tracking-wider">{app.reference}</span>
              </span>
              <span>
                <span className="block font-semibold">{status.line}</span>
                {status.detail && (
                  <span className="muted measure mt-1 block whitespace-pre-line">
                    {status.detail}
                  </span>
                )}
                {app.stage === 'withdrawn' && (
                  <span className="mt-4 block">
                    <ApplyAgainButton kind={app.type} />
                  </span>
                )}
              </span>
              <span className="flex flex-col items-start gap-1 self-center sm:items-end">
                {status.link && (
                  <a className="link link-caps min-h-11 content-center" href={status.link.href}>
                    {status.link.label}
                  </a>
                )}
                {app.stage === 'draft' && (
                  <DeleteDraftButton kind={app.type} reference={app.reference} />
                )}
                {app.stage !== 'draft' && WITHDRAWABLE.includes(app.stage) && (
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
                <span className="muted">{label(app.type)}</span>
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
      {docs.length > 0 && notStarted.length > 0 && (
        <div className="mt-10">
          <h3 className="label">Start another</h3>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">{startLinks}</div>
          <p className="muted mt-3 text-base">
            Only applications you have not yet started are shown here.
          </p>
        </div>
      )}
    </section>
  )

  const signingOut = (
    <section className="mt-14 border-t border-border pt-8">
      <h2 className="sr-only">Signing out</h2>
      <SignOutButtons />
      <p className="muted mt-4 text-base">
        Trouble with your account? Write to{' '}
        <a className="link" href="mailto:tech@pjk.co.in">
          tech@pjk.co.in
        </a>
        .
      </p>
    </section>
  )

  // One email can hold both IDs; the member chooses which account they are looking at
  const view = chooseView(member, jar.get(VIEW_COOKIE)?.value)

  if (view === 'artist') {
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
              Your works:{' '}
              {member.worksFolder
                ? 'in your Google Drive folder.'
                : 'give us the Google Drive folder they are in.'}{' '}
              <a className="link" href="/account/works">
                {member.worksFolder ? 'See how to set it out' : 'Add your folder'}
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

  if (view === 'partner') {
    return (
      <OnboardingPage
        heading="Your account"
        intro={<>Signed in as {member.email}.</>}
        label={<AccountSwitcher current="partner" />}
      >
        <section>
          <h2 className="display-sm">Partner</h2>
          <dl className="mt-4 grid gap-y-3 sm:grid-cols-[12rem_1fr]">
            <dt className="label pt-1">Member ID</dt>
            <dd className="tracking-wider">{member.partnerId}</dd>
            <dt className="label pt-1">Standing</dt>
            <dd>
              {member.standing === 'on-hold' ? 'Approved partner, on hold' : 'Approved partner'}
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
        {docs.some((a) => a.type === 'artist') && applicationsSection}
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
        {signingOut}
      </PhulhaarPage>
    )
  }

  return (
    <OnboardingPage
      heading="Your account"
      intro={<>Signed in as {member.email}.</>}
      label="Your account"
    >
      {applicationsSection}
      {signingOut}
    </OnboardingPage>
  )
}
