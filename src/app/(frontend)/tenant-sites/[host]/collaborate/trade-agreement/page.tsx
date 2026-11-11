import type { Metadata } from 'next'

import { TRADE_AGREEMENT } from '@/agreements/documents'
import { AgreementPage } from '@/components/agreements/AgreementPage'

// Per request: who is signed in decides what the page shows
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign the trade agreement',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <AgreementPage agreement={TRADE_AGREEMENT} />
}
