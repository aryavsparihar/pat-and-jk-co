import type { Form as FormType } from '@payloadcms/plugin-form-builder/types'
import type { FormBlock as FormBlockProps } from '@/payload-types'

import { SocialLinks } from '@/components/SocialLinks'
import { Heading, Section } from '@/components/Typography'
import React from 'react'

import type { BlockContext } from '../types'
import { FormClient } from './FormClient'

export const FormBlock: React.FC<FormBlockProps & { ctx: BlockContext }> = ({
  eyebrow,
  heading,
  intro,
  form,
  showContactDetails,
  ctx,
}) => {
  if (!form || typeof form !== 'object') return null
  const settings = ctx.settings
  const hasDetails =
    showContactDetails &&
    (settings?.email ||
      settings?.technicalEmail ||
      settings?.phone ||
      settings?.address ||
      settings?.socials?.length)

  return (
    <Section id="form" label={eyebrow}>
      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-9">
        <div className="lg:col-span-4">
          <Heading className="display-md max-w-[14ch]" text={heading} />
          {intro && <p className="mt-5">{intro}</p>}

          {hasDetails && (
            <dl className="mt-10 space-y-6 border-t border-border pt-8">
              {settings?.email && (
                <div>
                  <dt className="label">Email</dt>
                  <dd className="mt-1">
                    <a className="link" href={`mailto:${settings.email}`}>
                      {settings.email}
                    </a>
                  </dd>
                </div>
              )}
              {settings?.technicalEmail && (
                <div>
                  <dt className="label">Technical enquiries</dt>
                  <dd className="mt-1">
                    <a className="link" href={`mailto:${settings.technicalEmail}`}>
                      {settings.technicalEmail}
                    </a>
                  </dd>
                </div>
              )}
              {settings?.phone && (
                <div>
                  <dt className="label">Telephone</dt>
                  <dd className="mt-1">
                    <a className="link" href={`tel:${settings.phone.replace(/\s+/g, '')}`}>
                      {settings.phone}
                    </a>
                  </dd>
                </div>
              )}
              {settings?.address && (
                <div>
                  <dt className="label">Address</dt>
                  <dd className="mt-1 whitespace-pre-line">{settings.address}</dd>
                  {settings.mapUrl && (
                    <a
                      className="link link-caps mt-2 inline-block"
                      href={settings.mapUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Map
                    </a>
                  )}
                </div>
              )}
              {settings?.socials && settings.socials.length > 0 && (
                <div>
                  <dt className="label">Elsewhere</dt>
                  <dd className="mt-2">
                    <SocialLinks socials={settings.socials} />
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <div className="lg:col-span-5">
          <FormClient form={form as unknown as FormType} />
        </div>
      </div>
    </Section>
  )
}
