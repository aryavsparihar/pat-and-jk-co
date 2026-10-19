import configPromise from '@payload-config'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import React from 'react'

import { MEMBER_COOKIE } from '@/security/constants'
import { readSession } from '@/security/memberSession'

/**
 * Every account page, with a notice above it while the account is on hold: they can read
 * everything, and the server refuses every change (src/members/http.ts), so they are told why
 * before they try.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const payload = await getPayload({ config: configPromise })
  const jar = await cookies()
  const active = await readSession(payload, jar.get(MEMBER_COOKIE)?.value).catch(() => null)
  const onHold = active?.member.standing === 'on-hold'
  return (
    <>
      {onHold && (
        <div className="container pt-[clamp(2rem,4vw,3rem)]" role="status">
          <p className="measure border-l-2 border-warning bg-surface py-5 pl-6 pr-4">
            <strong>Your account is on hold.</strong> You can see everything here, but nothing can
            be changed, and payouts are paused, for now. Please write to{' '}
            <a className="link" href="mailto:hello@pjk.co.in">
              hello@pjk.co.in
            </a>{' '}
            if you have any questions.
          </p>
        </div>
      )}
      {children}
    </>
  )
}
