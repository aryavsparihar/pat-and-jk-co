import type React from 'react'

import { referenceHref } from '@/utilities/docHref'
import { getRedirectFor } from '@/utilities/queries'
import { notFound, redirect } from 'next/navigation'

interface Props {
  disableNotFound?: boolean
  tenantId: number
  url: string
}

/** Applies redirects managed in Admin → Redirects for this brand, otherwise shows the 404 page. */
export const PayloadRedirects: React.FC<Props> = async ({ disableNotFound, tenantId, url }) => {
  const redirectItem = await getRedirectFor(tenantId, url)

  if (redirectItem) {
    const target =
      redirectItem.to?.type === 'custom'
        ? redirectItem.to.url
        : referenceHref(redirectItem.to?.reference as { relationTo: string; value: unknown } | null)
    if (target && target !== url) redirect(target)
  }

  if (disableNotFound) return null

  notFound()
}
