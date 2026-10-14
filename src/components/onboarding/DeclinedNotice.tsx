import React from 'react'

import { BrandSocialLinks } from '@/components/BrandSocialLinks'
import type { SocialPlatform } from '@/brands/socialIcons'
import { APPLICATIONS_CONTACT } from '@/members/contact'

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * What someone sees when their application was not accepted: said plainly and kindly, with the
 * note from staff if there is one, who to write to, Phulhaar's own accounts to follow (for artists,
 * and only those filled in under Site settings), and when they may apply again. The same words as
 * the email that told them (src/members/emails.ts, decisionEmail).
 *
 * Works on the server and in the browser; `action` is the "Apply again" button, once it is time.
 */
export const DeclinedNotice: React.FC<{
  reference: string
  kind: 'artist' | 'partner'
  note?: string | null
  reapplyFrom?: string | null
  /** The wait is over */
  ready: boolean
  socials: { platform: SocialPlatform; label: string; url: string }[]
  action?: React.ReactNode
  headingLevel?: 'h2' | 'h3'
}> = ({ reference, kind, note, reapplyFrom, ready, socials, action, headingLevel = 'h2' }) => {
  const Heading = headingLevel
  return (
    <div>
      <p className="label">Application {reference}</p>
      <Heading className="display-md mt-3 max-w-[22ch]">
        Thank you for applying. We are not able to accept your application this time.
      </Heading>
      <p className="lede measure mt-6">
        We read every application ourselves, and we know the care that goes into one.
      </p>

      {note && (
        <div className="measure mt-8 border-l-2 border-primary bg-surface py-5 pl-6 pr-4">
          <p className="font-medium">A note from us</p>
          <p className="mt-2 whitespace-pre-line">{note}</p>
        </div>
      )}

      <p className="measure mt-8">
        For any further questions, contact us at{' '}
        <a className="link" href={`mailto:${APPLICATIONS_CONTACT}`}>
          {APPLICATIONS_CONTACT}
        </a>
        .
      </p>

      <div className="measure mt-8">
        {ready ? (
          <>
            <p className="font-medium">You are welcome to apply again.</p>
            <p className="mt-2">
              {kind === 'artist'
                ? 'A new application starts with your answers filled in, for you to look over. Only your identity documents and identity photo are asked for again.'
                : 'A new application starts with your answers filled in, for you to look over.'}
            </p>
            {action && <div className="mt-6">{action}</div>}
          </>
        ) : reapplyFrom ? (
          <p>
            You are welcome to apply again from{' '}
            <strong className="font-medium">{longDate(reapplyFrom)}</strong>. Sign in then and your
            answers will be there to look over.
          </p>
        ) : null}
      </div>

      {kind === 'artist' && (
        <BrandSocialLinks
          className="mt-10 border-t border-border pt-8"
          heading="Follow Phulhaar"
          links={socials}
        />
      )}
    </div>
  )
}
