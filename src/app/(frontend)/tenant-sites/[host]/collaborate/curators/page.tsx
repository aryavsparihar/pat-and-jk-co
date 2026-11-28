import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { CuratorApplication } from '@/components/onboarding/CuratorApplication'
import { createFormToken } from '@/members/formToken'
import { getTenantContext } from '@/utilities/tenant'

// Rendered per request: the page carries a fresh form token and a per-request script nonce
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Curate with us',
  description:
    'PJK works with guest curators one project at a time, for Phulhaar Gallery and for private collections, events and sets.',
}

/**
 * The guest curator form (the founder's ApplyCurator design), in the house frame. No account is
 * needed, and it stays open whether or not artist and trade applications are: curators are taken
 * one project at a time, whenever they write.
 */
export default async function CuratorApplicationPage({
  params,
}: {
  params: Promise<{ host: string }>
}) {
  await headers()
  const ctx = await getTenantContext((await params).host)
  if (!ctx) notFound()
  return (
    <div className="house apply">
      <div className="house-wrap">
        <CuratorApplication formToken={createFormToken()} />
      </div>
    </div>
  )
}
