import React from 'react'

import { OnboardingPage } from '@/components/onboarding/OnboardingPage'

const SECTIONS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/works', label: 'Your works' },
  { href: '/account/payouts', label: 'Payouts' },
  { href: '/account/settings', label: 'Account' },
] as const

/**
 * An approved artist's account: the page frame, with the portal's sections. Partners and
 * applicants see their overview only, so they get the plain frame.
 */
export const PortalFrame: React.FC<{
  current: (typeof SECTIONS)[number]['href']
  heading: string
  intro: React.ReactNode
  children: React.ReactNode
}> = ({ current, heading, intro, children }) => (
  <OnboardingPage heading={heading} intro={intro} label="Your account">
    <nav aria-label="Your account" className="-mt-4 mb-12 border-b border-border">
      <ul className="flex flex-wrap gap-x-8">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <a
              aria-current={s.href === current ? 'page' : undefined}
              className="link-caps inline-flex min-h-11 items-center border-b-2 border-transparent aria-[current=page]:border-primary aria-[current=page]:text-primary"
              href={s.href}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
    {children}
  </OnboardingPage>
)
