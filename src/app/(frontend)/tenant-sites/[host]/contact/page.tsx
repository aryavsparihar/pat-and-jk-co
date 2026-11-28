import type { Metadata } from 'next'

import { notFound } from 'next/navigation'
import React from 'react'

import { ContactForm } from '@/components/contact/ContactForm'
import { HouseSection } from '@/components/house/HouseSection'
import { houseMetadata } from '@/components/house/meta'
import { topicFor } from '@/contact/topics'
import { createFormToken } from '@/members/formToken'
import { directionsUrl, officeLines } from '@/utilities/address'
import { getTenantContext } from '@/utilities/tenant'

type Args = {
  params: Promise<{ host: string }>
  searchParams: Promise<{ about?: string | string[] }>
}

// A fresh form token for every visit
export const dynamic = 'force-dynamic'

/**
 * Contact, as in the founder's design (Contact.html; his brief, section 8): the addresses to
 * write to and the office, and the form whose subject decides which inbox a message reaches.
 * A link may choose the subject for the visitor: /contact?about=working-for-pjk.
 */
export default async function ContactPage({ params, searchParams }: Args) {
  const { host } = await params
  const ctx = await getTenantContext(host)
  if (!ctx) notFound()
  const { about } = await searchParams
  const chosen = topicFor(Array.isArray(about) ? about[0] : about)?.value ?? ''
  const settings = ctx.settings
  const addresses = [
    { label: 'General enquiries', email: settings?.email },
    { label: 'Business and trade', email: settings?.businessEmail },
    { label: 'Website and account help', email: settings?.technicalEmail },
  ].filter((a): a is { label: string; email: string } => Boolean(a.email))
  // Street, landmark, town and PIN code, and country: the design's four lines
  const office = officeLines(settings)
  const directions = directionsUrl(settings)
  const business = settings?.businessEmail || 'business@pjk.co.in'

  return (
    <div className="house">
      <div className="house-wrap">
        <HouseSection hero label="Contact">
          <h1 className="house-h1">Contact</h1>
          <p className="house-lead m-0">
            Write to us about the house, Phulhaar Gallery, or anything else. Every message is read
            and answered by a person.
          </p>
        </HouseSection>

        <HouseSection
          className="pb-[clamp(4rem,8vw,6.875rem)]"
          contentClassName="flex flex-wrap gap-14"
          label="Enquiries"
        >
          <div className="min-w-0 flex-[1_1_340px]">
            <h2 className="house-h2">Send us a message</h2>
            <p className="mb-8 text-[1.1875rem] leading-[1.7]">
              Choose the subject that fits best, and your message will reach the right person. For
              trade and business matters, you can also write directly to{' '}
              <a href={`mailto:${business}`}>{business}</a>. We reply within two working days,
              Indian Standard Time (IST, UTC+5:30).
            </p>
            <dl className="flex flex-col gap-[22px] border-t border-[#d9d4c8] pt-7">
              {addresses.map((a) => (
                <div key={a.email}>
                  <dt className="house-small mb-1">{a.label}</dt>
                  <dd className="m-0 text-[1.1875rem]">
                    <a href={`mailto:${a.email}`}>{a.email}</a>
                  </dd>
                </div>
              ))}
              {office.length > 0 && (
                <div>
                  <dt className="house-small mb-1">Office</dt>
                  <dd className="m-0 text-[1.1875rem] leading-[1.55]">
                    <address className="not-italic">
                      {office.map((line) => (
                        <span className="block" key={line}>
                          {line}
                        </span>
                      ))}
                    </address>
                    <p className="mb-2.5 mt-1.5 text-base italic text-[#3b4a40]">
                      Visits by appointment
                    </p>
                    {directions && (
                      <a
                        className="house-tl"
                        href={directions}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Get directions
                        <span className="sr-only"> (opens a map in a new tab)</span>
                      </a>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="min-w-0 flex-[1.2_1_380px]">
            <ContactForm about={chosen} formToken={createFormToken()} />
          </div>
        </HouseSection>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return houseMetadata(
    host,
    '/contact',
    'Contact — PAT & J.K. Co.',
    'Write to PAT & J.K. Co. about the house, Phulhaar Gallery, or anything else. Every message is read and answered by a person.',
  )
}
