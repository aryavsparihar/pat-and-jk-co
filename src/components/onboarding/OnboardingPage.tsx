import React from 'react'

import { Heading } from '@/components/Typography'

/**
 * The frame every onboarding page shares: a margin label, a heading, a line of introduction, and
 * the form beneath, in the site's letterhead layout.
 */
export const OnboardingPage: React.FC<{
  label: string
  heading: string
  intro: React.ReactNode
  children: React.ReactNode
}> = ({ label, heading, intro, children }) => (
  <div className="container pb-[clamp(4rem,8vw,7rem)] pt-[clamp(3rem,6vw,5rem)]">
    <div className="grid gap-x-12 gap-y-5 lg:grid-cols-12">
      <p className="label lg:col-span-3 lg:pt-3">{label}</p>
      <div className="min-w-0 lg:col-span-9">
        <Heading className="display-lg max-w-[18ch]" text={heading} />
        <div className="lede measure mt-6">{intro}</div>
        <div className="mt-14">{children}</div>
      </div>
    </div>
  </div>
)
