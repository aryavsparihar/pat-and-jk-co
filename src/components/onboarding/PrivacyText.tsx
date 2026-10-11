import React from 'react'

import RichText from '@/components/RichText'
import type { Page } from '@/payload-types'
import { getPageBySlug } from '@/utilities/queries'

/**
 * The published privacy policy (Pages → Privacy policy), as text for the consent dialog in the
 * Identity step: its content blocks in order, without the page's own heading and layout. Empty if
 * the page is missing, and the dialog then points to /privacy.
 */
export const PrivacyText = async ({ tenantId }: { tenantId: number }) => {
  const page = (await getPageBySlug(tenantId, 'privacy', false)) as Page | null
  const blocks = (page?.layout ?? []).flatMap((block) =>
    block.blockType === 'content'
      ? (block.columns ?? []).flatMap((column) => (column.richText ? [column.richText] : []))
      : [],
  )
  if (!blocks.length) {
    return (
      <p>
        The privacy policy could not be shown here. Please read it at{' '}
        <a className="link" href="/privacy" rel="noopener noreferrer" target="_blank">
          pjk.co.in/privacy
        </a>{' '}
        before you agree.
      </p>
    )
  }
  return (
    <div className="grid gap-y-6">
      {blocks.map((data, i) => (
        <RichText data={data} key={i} />
      ))}
    </div>
  )
}
