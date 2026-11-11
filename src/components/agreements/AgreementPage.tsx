import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import React from 'react'

import type { AgreementDocument } from '@/agreements/documents'
import { sectionGroups } from '@/blocks/Content/SectionNav'
import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { SignInForm } from '@/components/onboarding/SignInForm'
import RichText from '@/components/RichText'
import { createFormToken } from '@/members/formToken'
import { MEMBER_COOKIE } from '@/security/constants'
import { readSession } from '@/security/memberSession'

import { AgreementExecution } from './AgreementExecution'

/**
 * /collaborate/artist-agreement and /collaborate/trade-agreement: where an approved artist or trade
 * partner signs. Signed out, the page asks for the emailed code; signed in without the right ID,
 * it says the page is not for them. Only then is the agreement shown, in full, in a scrolling
 * frame with a menu of its seven segments, and beneath it the signing (AgreementExecution), which
 * asks for their ID again before it shows anything about them.
 */
export const AgreementPage = async ({ agreement }: { agreement: AgreementDocument }) => {
  const payload = await getPayload({ config: configPromise })
  const active = await readSession(payload, (await cookies()).get(MEMBER_COOKIE)?.value)
  const who = agreement.kind === 'artist' ? 'approved artists' : 'approved trade partners'

  if (!active) {
    return (
      <OnboardingPage
        heading="Sign your agreement"
        intro={`This page is for ${who}. Sign in with the email address you applied with, and we will send you a code.`}
        label="Agreement"
      >
        <SignInForm formToken={createFormToken()} next={`/collaborate/${agreement.slug}`} />
      </OnboardingPage>
    )
  }
  if (!active.member[agreement.idField]) {
    return (
      <OnboardingPage
        heading="Sign your agreement"
        intro={`This page is for ${who}. Your account has no ${agreement.prefix} ID yet: it is issued when your application is approved, and we email it to you then.`}
        label="Agreement"
      >
        <a className="link link-caps" href="/account">
          Go to your account
        </a>
      </OnboardingPage>
    )
  }

  // The founder's segment titles, in place of the headings', for the menu
  const segments = sectionGroups(agreement.text).map((group, i) => ({
    id: group.id,
    label: agreement.segments[i] ?? group.label,
  }))
  const { text: _text, ...wording } = agreement

  return (
    <div className="container pb-[clamp(4rem,8vw,7rem)] pt-[clamp(3rem,6vw,5rem)]">
      <div className="grid gap-x-12 gap-y-5 lg:grid-cols-12">
        <p className="label lg:col-span-3 lg:pt-3">Agreement</p>
        <div className="min-w-0 lg:col-span-9">
          <h1 className="display-md max-w-[30ch]">{agreement.title}</h1>
          <p className="lede measure mt-6">Last Updated: {agreement.lastUpdated}.</p>
        </div>
      </div>

      <div className="mt-12 grid gap-x-12 gap-y-6 lg:grid-cols-12">
        <nav aria-label="Segments" className="text-base lg:col-span-3">
          <ol className="grid gap-y-3 lg:sticky lg:top-28">
            {segments.map((segment) => (
              <li key={segment.id}>
                <a
                  className="underline decoration-transparent underline-offset-[0.22em] hover:decoration-current"
                  href={`#${segment.id}`}
                >
                  {segment.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 lg:col-span-9">
          <section
            aria-label={agreement.title}
            className="h-[min(78dvh,56rem)] overflow-y-auto overscroll-contain border border-border"
            tabIndex={0}
          >
            <div className="border-b border-border bg-background px-5 py-4 sm:px-8 lg:sticky lg:top-0 lg:z-10">
              <p className="text-base font-semibold sm:text-lg">{agreement.banner[0]}</p>
              <p className="muted mt-1 text-sm sm:text-base">{agreement.banner[1]}</p>
            </div>
            <RichText
              className="scroll-mt-28 px-6 py-6 sm:px-8 [&_h2]:scroll-mt-28"
              data={agreement.text as never}
            />
          </section>

          <AgreementExecution agreement={wording} />
        </div>
      </div>
    </div>
  )
}
