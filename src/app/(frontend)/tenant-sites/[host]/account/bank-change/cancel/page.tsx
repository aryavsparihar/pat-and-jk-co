import type { Metadata } from 'next'
import React from 'react'

import { CancelBankChange } from '@/components/account/CancelBankChange'
import { OnboardingPage } from '@/components/onboarding/OnboardingPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Stop a change of bank details',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

/**
 * From the "this was not me" link in the bank-change email. Nothing happens on opening the page:
 * a mail scanner following the link must not cancel anything. The button sends the token by POST.
 */
export default async function CancelBankChangePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>
}) {
  const { t } = await searchParams
  return (
    <OnboardingPage
      heading="Stop a change of bank details"
      intro={<>If you did not ask to change where we pay you, stop it here.</>}
      label="Members"
    >
      <CancelBankChange token={typeof t === 'string' ? t : ''} />
    </OnboardingPage>
  )
}
