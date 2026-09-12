import type { Form as FormType } from '@payloadcms/plugin-form-builder/types'
import type { FormBlock as FormBlockProps } from '@/payload-types'

import { Reveal } from '@/components/Reveal'
import { SocialLinks } from '@/components/SocialLinks'
import { SectionHeader } from '@/components/Typography'
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
    (settings?.email || settings?.phone || settings?.address || settings?.socials?.length)

  return (
    <section className="section" id="form">
      <div className="container grid gap-x-20 gap-y-14 lg:grid-cols-12">
        <Reveal className="lg:col-span-5">
          <SectionHeader eyebrow={eyebrow} heading={heading} intro={intro} />

          {hasDetails && (
            <dl className="mt-12 space-y-8 border-t border-border pt-10">
              {settings?.email && (
                <div>
                  <dt className="eyebrow">Email</dt>
                  <dd className="mt-2 font-serif text-2xl">
                    <a className="hover:text-primary" href={`mailto:${settings.email}`}>
                      {settings.email}
                    </a>
                  </dd>
                </div>
              )}
              {settings?.phone && (
                <div>
                  <dt className="eyebrow">Telephone</dt>
                  <dd className="mt-2 font-serif text-2xl">
                    <a
                      className="hover:text-primary"
                      href={`tel:${settings.phone.replace(/\s+/g, '')}`}
                    >
                      {settings.phone}
                    </a>
                  </dd>
                </div>
              )}
              {settings?.address && (
                <div>
                  <dt className="eyebrow">Studio</dt>
                  <dd className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">
                    {settings.address}
                  </dd>
                  {settings.mapUrl && (
                    <a
                      className="btn-text mt-3"
                      href={settings.mapUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      View on map{' '}
                      <span aria-hidden className="arrow">
                        ↗
                      </span>
                    </a>
                  )}
                </div>
              )}
              {settings?.socials && settings.socials.length > 0 && (
                <div>
                  <dt className="eyebrow">Follow</dt>
                  <dd className="mt-3">
                    <SocialLinks socials={settings.socials} />
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Reveal>

        <Reveal className="lg:col-span-7" delay={120}>
          <div className="frame p-[clamp(1.75rem,4vw,3.25rem)] [&::after]:hidden">
            <FormClient form={form as unknown as FormType} />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
