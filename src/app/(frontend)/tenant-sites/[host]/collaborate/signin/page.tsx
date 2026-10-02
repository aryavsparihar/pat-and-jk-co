import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { OnboardingPage } from '@/components/onboarding/OnboardingPage'
import { SignInForm } from '@/components/onboarding/SignInForm'
import { createFormToken } from '@/members/formToken'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

export default async function MemberSignInPage() {
  await headers()
  return (
    <OnboardingPage
      heading="Sign in"
      intro="For artists and partners who have applied to work with us. Staff sign in elsewhere."
      label="Members"
    >
      <SignInForm formToken={createFormToken()} />
    </OnboardingPage>
  )
}
