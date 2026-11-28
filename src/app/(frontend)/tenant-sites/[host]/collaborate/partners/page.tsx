import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { ApplicationsClosed } from '@/components/onboarding/ApplicationsClosed'
import { TradeApplication } from '@/components/onboarding/TradeApplication'
import { createFormToken } from '@/members/formToken'
import { applicationsOpenness } from '@/members/openness'
import { getTenantContext } from '@/utilities/tenant'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

// Rendered per request: the page carries a fresh form token and a per-request script nonce
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Apply for a trade account',
  description:
    'For interior designers, architects, art advisers, dealers and hospitality specifiers who buy or specify art for their clients.',
}

export default async function TradeApplicationPage({
  params,
}: {
  params: Promise<{ host: string }>
}) {
  await headers()
  const ctx = await getTenantContext((await params).host)
  if (!ctx) notFound()
  const payload = await getPayload({ config: configPromise })
  const { open, note } = await applicationsOpenness(payload)
  // The founder's ApplyPartner design, in the house frame of the other pages
  return (
    <div className="house apply">
      <div className="house-wrap">
        {open ? (
          <TradeApplication formToken={createFormToken()} />
        ) : (
          <section className="house-sec">
            <div className="house-lab" />
            <div className="house-con max-w-[780px]">
              <p className="house-small">Trade partners</p>
              <h1 className="apply-h1">Apply for a trade account</h1>
              <ApplicationsClosed note={note} />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
