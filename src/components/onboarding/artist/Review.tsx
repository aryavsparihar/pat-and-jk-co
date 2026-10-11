'use client'

import React, { useEffect, useState } from 'react'

import { LANGUAGES, MEDIUMS, PRICE_RANGES } from '@/members/forms/schemas'

import { api } from '../api'
import { Check, TextField } from '../fields'
import type { StepProps, Values } from './steps'

type Section = { step: string; title: string; rows: [string, React.ReactNode][] }

const labelOf = (list: readonly { value: string; label: string }[], value: unknown) =>
  list.find((o) => o.value === value)?.label ?? (value as string)

const addressLine = (a: Values | undefined) =>
  a
    ? [
        a.line1,
        a.line2,
        a.landmark,
        a.city,
        a.district,
        [a.state, a.postalCode].filter(Boolean).join(' '),
        a.country,
      ]
        .filter(Boolean)
        .join(', ')
    : '—'

/**
 * Everything once more, with a way back to each step, then the declarations. The consent to
 * process identity details is separate from the others and says what for, for how long,
 * and how to take it back, as the Digital Personal Data Protection Act asks.
 */
export const ReviewStep: React.FC<
  StepProps & {
    all: Record<string, Values>
    onEdit: (step: string) => void
    /** The Terms & Conditions to agree to, while they are published in Site settings */
    terms?: { url: string; filename: string } | null
  }
> = ({ values, set, errors, all, onEdit, terms }) => {
  const about = all.about ?? {}
  const address = all.address ?? {}
  const practice = all.practice ?? {}
  const works: Values[] = all.portfolio?.works ?? []
  const [kyc, setKyc] = useState<{
    panMasked: string | null
    aadhaarMasked: string | null
    idChoice: 'aadhaar' | 'other' | null
    otherIdKind: string | null
  } | null>(null)

  // Only the masked view ever reaches the browser
  useEffect(() => {
    let current = true
    void api<{ kyc: typeof kyc }>('/next/members/kyc').then((r) => {
      if (current) setKyc(r.data.kyc ?? null)
    })
    return () => {
      current = false
    }
  }, [])

  const sections: Section[] = [
    {
      step: 'about',
      title: 'About you',
      rows: [
        ['Full legal name', about.legalName],
        ['Name you work under', about.displayName],
        ['Date of birth', about.dateOfBirth],
        ['Mobile', about.phone],
        ['Language', LANGUAGES.includes(about.language) ? about.language : '—'],
      ],
    },
    {
      step: 'address',
      title: 'Address',
      rows: [
        ['Where you live', addressLine(address.residence)],
        [
          'Post goes to',
          address.correspondenceSame === false
            ? addressLine(address.correspondence)
            : 'The same address',
        ],
        ['Map pin', typeof address.residence?.latitude === 'number' ? 'Placed' : 'None'],
      ],
    },
    {
      step: 'practice',
      title: 'Your practice',
      rows: [
        [
          'Mediums',
          (practice.mediums ?? []).map((m: string) => labelOf(MEDIUMS, m)).join(', ') || '—',
        ],
        [
          'Years practising',
          practice.yearsPractising === 0 ? 'Less than one' : (practice.yearsPractising ?? '—'),
        ],
        ['Price range', labelOf(PRICE_RANGES, practice.priceRange) || '—'],
        [
          'Biography',
          practice.bio
            ? `${String(practice.bio).slice(0, 160)}${String(practice.bio).length > 160 ? '…' : ''}`
            : '—',
        ],
        [
          'Exhibitions and awards',
          practice.recognitionNone
            ? 'None yet'
            : (practice.recognition ?? [])
                .map((r: Values) => r.title)
                .filter(Boolean)
                .join(', ') || '—',
        ],
        [
          'Online',
          [
            practice.website && 'Website',
            practice.instagram && 'Instagram',
            practice.facebook && 'Facebook',
            ...(practice.otherSocials ?? []).map((o: Values) => o.platform),
          ]
            .filter(Boolean)
            .join(', ') || '—',
        ],
      ],
    },
    {
      step: 'portfolio',
      title: 'Your work',
      rows: [['Works', works.length ? works.map((w) => w.title || 'Untitled').join(', ') : '—']],
    },
    {
      step: 'kyc',
      title: 'Identity',
      rows: [
        ['PAN', kyc?.panMasked],
        ...(kyc?.aadhaarMasked ? [['Aadhaar', kyc.aadhaarMasked] as [string, string]] : []),
        ...(kyc?.idChoice === 'other'
          ? [
              [
                'ID',
                (
                  {
                    passport: 'Passport',
                    'voter-id': 'Voter ID',
                    'driving-licence': 'Driving licence',
                  } as Record<string, string>
                )[kyc.otherIdKind ?? ''] ?? 'Another ID',
              ] as [string, string],
            ]
          : []),
      ],
    },
  ]

  return (
    <div>
      <div className="grid gap-y-10">
        {sections.map((section) => (
          <section className="border-t border-border pt-6" key={section.step}>
            <div className="flex items-baseline justify-between gap-6">
              <h3 className="display-sm">{section.title}</h3>
              <button
                className="link link-caps min-h-11"
                onClick={() => onEdit(section.step)}
                type="button"
              >
                Edit<span className="sr-only"> {section.title}</span>
              </button>
            </div>
            <dl className="mt-4 grid gap-y-3 sm:grid-cols-[12rem_1fr]">
              {section.rows.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="label pt-1">{label}</dt>
                  <dd className="min-w-0 break-words">{value || '—'}</dd>
                </React.Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <fieldset className="mt-14 border-t border-border-strong pt-8">
        <legend className="display-sm mb-6">Before you send it</legend>
        <div className="grid gap-y-4">
          <Check
            checked={Boolean(values.originalWork)}
            error={errors.originalWork}
            label="The work I have shown is my own original work, and I hold the rights to it."
            name="originalWork"
            onValue={(v) => set('originalWork', v)}
          />
          <Check
            checked={Boolean(values.accurate)}
            error={errors.accurate}
            label="The information I have given is accurate."
            name="accurate"
            onValue={(v) => set('accurate', v)}
          />
          <Check
            checked={Boolean(values.consentProcessing)}
            error={errors.consentProcessing}
            label={
              <>
                I agree to PAT and J.K. Co. processing my identity details, including a photo of me,
                to verify who I am, and for nothing else. They are kept encrypted, seen only by the
                few people at PJK who verify them, and kept no longer than the privacy notice says.
                I can withdraw this consent at any time by writing to us. Read the{' '}
                <a className="link" href="/privacy" rel="noopener" target="_blank">
                  privacy notice
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                .
              </>
            }
            name="consentProcessing"
            onValue={(v) => set('consentProcessing', v)}
          />
        </div>
      </fieldset>

      {terms && (
        <fieldset className="mt-12 border-t border-border pt-10">
          <legend className="display-sm mb-4">Terms and conditions</legend>
          <p className="measure">
            Please read the terms on which we work with artists before you send your application.
          </p>
          <p className="mt-4">
            <a className="link link-caps" href={terms.url} rel="noopener" target="_blank">
              Read the Terms & Conditions (PDF)
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <div className="mt-8 grid gap-y-8">
            <Check
              checked={Boolean(values.agreeTerms)}
              error={errors.agreeTerms}
              label="I have read the Terms & Conditions and I agree to them."
              name="agreeTerms"
              onValue={(v) => set('agreeTerms', v)}
            />
            <TextField
              autoCapitalize="characters"
              autoComplete="off"
              className="max-w-xs"
              errors={errors}
              hint="Type the words I AGREE, to confirm."
              label="Type I AGREE"
              name="agreeTyped"
              onValue={(v) => set('agreeTyped', v)}
              spellCheck={false}
              value={values.agreeTyped}
            />
          </div>
        </fieldset>
      )}
    </div>
  )
}
