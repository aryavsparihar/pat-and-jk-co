import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { SignInForm } from '@/components/onboarding/SignInForm'
import { AFK_LIMIT_MINUTES } from '@/components/session/afk'
import { createFormToken } from '@/members/formToken'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default async function MemberSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  await headers()
  // Sent here by the away-from-the-keyboard limit (src/components/session/afk.ts), which
  // says so rather than leaving a signed-out page unexplained
  const afterIdle = (await searchParams).from === 'idle'
  return (
    <OnboardingPage
      heading="Sign in"
      intro={
        <>
          {afterIdle && (
            <p className="mb-4">
              You were signed out after {AFK_LIMIT_MINUTES} minutes without activity, to keep your
              account safe.
            </p>
          )}
          <p>
            For artists and partners who have applied to work with us. Staff sign in elsewhere.
          </p>
        </>
      }
      label="Members"
    >
      <SignInForm formToken={createFormToken()} />
    </OnboardingPage>
  )
}
