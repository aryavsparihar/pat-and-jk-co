'use client'

import React, { useEffect, useState } from 'react'

import { ARTIST_DECLARATIONS } from '@/members/applicationNotice'
import { experienceLabel, MEDIUMS, PRICE_RANGES } from '@/members/forms/schemas'

import { api } from '../api'
import { Check, fieldClass, idFor } from '../fields'
import type { StepProps, Values } from './steps'

type Image = { id: number; thumbnail: string | null }

const labelOf = (list: readonly { value: string; label: string }[], value: unknown) =>
  list.find((o) => o.value === value)?.label ?? (value as string)

/** "4 March 1994", from the stored YYYY-MM-DD */
const longDate = (iso: unknown) => {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** An address on the lines it is written on: street, landmark, town with region and code, country */
const AddressLines: React.FC<{ address?: Values }> = ({ address: a }) => {
  if (!a?.line1) return <>—</>
  const lines = [
    [a.line1, a.line2].filter(Boolean).join(', '),
    a.landmark,
    [a.city, [a.state, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    a.country,
  ].filter(Boolean)
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </React.Fragment>
      ))}
    </>
  )
}

/** "2025 · 30 × 22 cm": height then width (and depth), in centimetres as the listing shows */
const workLine = (w: Values) => {
  const factor = w.unit === 'in' ? 2.54 : 1
  const cm = (v: unknown) =>
    v === undefined || v === '' || v === null
      ? null
      : Math.round(Number(String(v).replace(',', '.')) * factor * 10) / 10
  const size = [cm(w.height), cm(w.width), cm(w.depth)].filter(
    (v): v is number => v !== null && !isNaN(v),
  )
  return [w.year, size.length ? `${size.join(' × ')} cm` : null].filter(Boolean).join(' · ')
}

const Biography: React.FC<{ text?: string }> = ({ text }) => {
  const [open, setOpen] = useState(false)
  if (!text) return <>—</>
  if (text.length <= 160 || open) return <span className="whitespace-pre-line">{text}</span>
  return (
    <>
      {text.slice(0, 160).trimEnd()}…{' '}
      <button className="link" onClick={() => setOpen(true)} type="button">
        Show all
      </button>
    </>
  )
}

const Heading: React.FC<{ title: string; edit: string; onEdit: () => void }> = ({
  title,
  edit,
  onEdit,
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-6">
    <h3 className="font-display text-[1.625rem] font-normal text-[var(--primary)]">{title}</h3>
    <button className="link link-caps min-h-11" onClick={onEdit} type="button">
      {edit}
    </button>
  </div>
)

const Section: React.FC<{
  title: string
  edit: string
  onEdit: () => void
  children: React.ReactNode
}> = ({ title, edit, onEdit, children }) => (
  <section className="border-t border-[#e3cfa3] pt-6">
    <Heading edit={edit} onEdit={onEdit} title={title} />
    <dl className="mt-3 grid gap-y-3 sm:grid-cols-[12rem_1fr]">{children}</dl>
  </section>
)

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt className="label pt-1">{label}</dt>
    <dd className="min-w-0 break-words">{children || '—'}</dd>
  </>
)

/**
 * Review and send (the Apply5 design): everything once more, with a way back to each step, then
 * the three statements to tick and I AGREE typed in capitals. Consent to how the details are used
 * was given in step 1, and a line here leads back to that notice.
 */
export const ReviewStep: React.FC<
  StepProps & {
    all: Record<string, Values>
    onEdit: (step: string) => void
  }
> = ({ values, set, errors, all, onEdit }) => {
  const about = all.about ?? {}
  const address = all.address ?? {}
  const practice = all.practice ?? {}
  const works: Values[] = all.portfolio?.works ?? []
  const [images, setImages] = useState<Record<number, string | null>>({})

  useEffect(() => {
    let current = true
    void api<{ images: Image[] }>('/next/members/portfolio').then((r) => {
      if (current && r.ok)
        setImages(Object.fromEntries((r.data.images ?? []).map((i) => [i.id, i.thumbnail])))
    })
    return () => {
      current = false
    }
  }, [])

  const online: string[] = [
    practice.website,
    practice.instagram,
    practice.facebook,
    ...(practice.otherSocials ?? []).map((o: Values) => o.handle),
  ]
    .filter(Boolean)
    .map((link: string) => link.replace(/^https?:\/\/(www\.)?/, ''))

  const agreeId = idFor('agreeTyped')

  return (
    <div>
      <div className="grid gap-y-10">
        <Section edit="Edit about you" onEdit={() => onEdit('about')} title="About you">
          <Row label="Full name">{about.legalName}</Row>
          <Row label="Works under">{about.displayName}</Row>
          <Row label="Date of birth">{longDate(about.dateOfBirth)}</Row>
          <Row label="Mobile">{about.phone}</Row>
        </Section>

        <Section edit="Edit address" onEdit={() => onEdit('address')} title="Where you live">
          <Row label="Home">
            <AddressLines address={address.residence} />
          </Row>
          <Row label="Post goes to">
            {address.correspondenceSame === false ? (
              <AddressLines address={address.correspondence} />
            ) : (
              'The same address'
            )}
          </Row>
          <Row label="Map pin">
            {typeof address.residence?.latitude === 'number' ? 'Added' : 'Not added'}
          </Row>
        </Section>

        <Section edit="Edit practice" onEdit={() => onEdit('practice')} title="Your practice">
          <Row label="Works in">
            {(practice.mediums ?? [])
              .map((m: string) =>
                m === 'other' && practice.mediumOther ? practice.mediumOther : labelOf(MEDIUMS, m),
              )
              .join(', ')}
          </Row>
          <Row label="Making work for">{experienceLabel(practice.yearsPractising)}</Row>
          <Row label="Usual price">{labelOf(PRICE_RANGES, practice.priceRange)}</Row>
          <Row label="Biography">
            <Biography text={practice.bio} />
          </Row>
          <Row label="Exhibitions">
            {practice.recognitionNone
              ? 'None yet'
              : (practice.recognition ?? [])
                  .map((r: Values) => r.title)
                  .filter(Boolean)
                  .join(', ')}
          </Row>
          <Row label="Online">
            {online.length
              ? online.map((link, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <br />}
                    {link}
                  </React.Fragment>
                ))
              : null}
          </Row>
        </Section>

        <section className="border-t border-[#e3cfa3] pt-6">
          <Heading edit="Edit works" onEdit={() => onEdit('portfolio')} title="Your work" />
          {works.length ? (
            <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-6">
              {works.map((w, i) => (
                <li key={`${w.image}-${i}`}>
                  <div className="aspect-square w-full overflow-hidden bg-[#f5ecd9]">
                    {images[w.image] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- an access-checked private picture
                      <img
                        alt={`Photograph of ${w.title || 'this work'}`}
                        className="size-full object-contain"
                        src={images[w.image]!}
                      />
                    ) : (
                      <span className="muted flex size-full items-center justify-center text-sm">
                        Photograph
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-medium">{w.title || 'Untitled'}</p>
                  <p className="muted text-base">{workLine(w)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3">—</p>
          )}
        </section>
      </div>

      <fieldset className="mt-14 border-t border-[#c9952b] pt-8">
        <legend className="font-display mb-6 text-[1.625rem] font-normal text-[var(--primary)]">
          Before you send it
        </legend>
        <div className="grid gap-y-3">
          <Check
            checked={Boolean(values.originalWork)}
            error={errors.originalWork}
            label={ARTIST_DECLARATIONS.originalWork}
            name="originalWork"
            onValue={(v) => set('originalWork', v)}
          />
          <Check
            checked={Boolean(values.notCopy)}
            error={errors.notCopy}
            label={ARTIST_DECLARATIONS.notCopy}
            name="notCopy"
            onValue={(v) => set('notCopy', v)}
          />
          <Check
            checked={Boolean(values.accurate)}
            error={errors.accurate}
            label={ARTIST_DECLARATIONS.accurate}
            name="accurate"
            onValue={(v) => set('accurate', v)}
          />
        </div>
        <div className="mt-8 max-w-xs">
          <label className="label mb-1 block" htmlFor={agreeId}>
            To confirm, type I AGREE
          </label>
          <p className="muted mb-2 text-base" id={`${agreeId}-hint`}>
            In capital letters.
          </p>
          <input
            aria-describedby={[`${agreeId}-hint`, errors.agreeTyped && `${agreeId}-error`]
              .filter(Boolean)
              .join(' ')}
            aria-invalid={errors.agreeTyped ? true : undefined}
            autoCapitalize="characters"
            autoComplete="off"
            className={`${fieldClass} tracking-wider`}
            id={agreeId}
            onChange={(e) => set('agreeTyped', e.target.value)}
            spellCheck={false}
            type="text"
            value={values.agreeTyped ?? ''}
          />
          {errors.agreeTyped && (
            <p className="mt-2 text-base italic text-destructive" id={`${agreeId}-error`}>
              {errors.agreeTyped}
            </p>
          )}
        </div>
        <p className="muted mt-8 text-base">
          We handle your details as set out in the privacy notice you agreed to in step 1.{' '}
          <button className="link" onClick={() => onEdit('about')} type="button">
            Read it again
          </button>
        </p>
      </fieldset>
    </div>
  )
}
