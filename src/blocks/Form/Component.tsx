import type { Form as FormType } from '@payloadcms/plugin-form-builder/types'
import type { FormBlock as FormBlockProps } from '@/payload-types'

import { OfficeAddress } from '@/components/OfficeAddress'
import { SocialLinks } from '@/components/SocialLinks'
import { Heading, Section } from '@/components/Typography'
import { officeLines } from '@/utilities/address'
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
      settings?.businessEmail ||
      settings?.technicalEmail ||
      settings?.phone ||
      officeLines(settings).length > 0 ||
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
                  <dt className="label">General enquiries</dt>
                  <dd className="mt-1">
                    <a className="link" href={`mailto:${settings.email}`}>
                      {settings.email}
                    </a>
                  </dd>
                </div>
              )}
              {settings?.businessEmail && (
                <div>
                  <dt className="label">Business enquiries</dt>
                  <dd className="mt-1">
                    <a className="link" href={`mailto:${settings.businessEmail}`}>
                      {settings.businessEmail}
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
              {officeLines(settings).length > 0 && (
                <div>
                  <dt className="label">Office</dt>
                  <dd className="mt-1">
                    <OfficeAddress settings={settings} />
                  </dd>
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
          <FormClient form={form as unknown as FormType} helpEmail={settings?.email} />
        </div>
      </div>
    </Section>
  )
}
