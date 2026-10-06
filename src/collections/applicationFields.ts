import type { Field } from 'payload'

import { LANGUAGES, MEDIUMS, PRICE_RANGES, RECOGNITION_KINDS } from '../members/forms/schemas'

/**
 * What an application holds, step by step. The shapes are checked by the step schemas in
 * src/members/forms/schemas.ts before anything is saved; these are the columns they land in.
 *
 * Read-only in the admin: staff review an application, they do not rewrite it. Decisions are taken
 * with the panel in the sidebar.
 */

const isArtist = (data: Record<string, unknown>) => data?.type === 'artist'
const isPartner = (data: Record<string, unknown>) => data?.type === 'partner'

export const addressFields = (): Field[] => [
  {
    type: 'row',
    fields: [
      { name: 'line1', label: 'Address line 1', type: 'text', admin: { width: '50%' } },
      { name: 'line2', label: 'Address line 2', type: 'text', admin: { width: '50%' } },
    ],
  },
  { name: 'landmark', type: 'text' },
  {
    type: 'row',
    fields: [
      { name: 'city', type: 'text', admin: { width: '33%' } },
      { name: 'district', type: 'text', admin: { width: '33%' } },
      { name: 'state', type: 'text', admin: { width: '33%' } },
    ],
  },
  {
    type: 'row',
    fields: [
      { name: 'postalCode', label: 'PIN code', type: 'text', admin: { width: '50%' } },
      { name: 'country', type: 'text', admin: { width: '50%' } },
    ],
  },
]

export const artistApplicationFields: Field[] = [
  {
    name: 'about',
    label: 'About the artist',
    type: 'group',
    admin: { condition: isArtist, readOnly: true },
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'legalName', type: 'text', admin: { width: '50%' } },
          {
            name: 'displayName',
            label: 'Name they work under',
            type: 'text',
            admin: { width: '50%' },
          },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'dateOfBirth',
            type: 'date',
            admin: {
              width: '33%',
              date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMMM yyyy' },
            },
          },
          { name: 'phone', type: 'text', admin: { width: '33%' } },
          {
            name: 'language',
            label: 'Preferred language',
            type: 'select',
            options: LANGUAGES.map((l) => ({ label: l, value: l })),
            admin: { width: '33%' },
          },
        ],
      },
    ],
  },
  {
    name: 'address',
    type: 'group',
    admin: { condition: isArtist, readOnly: true },
    fields: [
      { name: 'residence', type: 'group', fields: addressFields() },
      {
        name: 'correspondenceSame',
        label: 'Correspondence goes to the same address',
        type: 'checkbox',
      },
      {
        name: 'correspondence',
        label: 'Address for correspondence',
        type: 'group',
        admin: { condition: (_, sibling) => sibling?.correspondenceSame === false },
        fields: addressFields(),
      },
    ],
  },
  {
    name: 'practice',
    type: 'group',
    admin: { condition: isArtist, readOnly: true },
    fields: [
      {
        name: 'mediums',
        type: 'select',
        hasMany: true,
        options: MEDIUMS.map(({ value, label }) => ({ value, label })),
      },
      { name: 'mediumOther', label: 'Other medium', type: 'text' },
      { name: 'stylesThemes', label: 'Styles and themes', type: 'textarea' },
      { name: 'yearsPractising', type: 'number' },
      { name: 'training', label: 'Training or education', type: 'textarea' },
      { name: 'bio', label: 'Biography', type: 'textarea' },
      { name: 'statement', label: 'Artist statement', type: 'textarea' },
      {
        type: 'row',
        fields: [
          { name: 'website', type: 'text', admin: { width: '50%' } },
          { name: 'instagram', type: 'text', admin: { width: '50%' } },
        ],
      },
      {
        name: 'priceRange',
        label: 'Typical price range',
        type: 'select',
        options: PRICE_RANGES.map(({ value, label }) => ({ value, label })),
      },
      {
        name: 'recognition',
        label: 'Exhibitions and awards',
        type: 'array',
        fields: [
          {
            type: 'row',
            fields: [
              {
                name: 'kind',
                type: 'select',
                options: RECOGNITION_KINDS.map(({ value, label }) => ({ value, label })),
                admin: { width: '25%' },
              },
              { name: 'title', type: 'text', admin: { width: '35%' } },
              { name: 'venue', type: 'text', admin: { width: '25%' } },
              { name: 'year', type: 'number', admin: { width: '15%' } },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'portfolio',
    label: 'Portfolio sample',
    type: 'array',
    maxRows: 10,
    admin: { condition: isArtist, readOnly: true },
    fields: [
      { name: 'image', type: 'upload', relationTo: 'portfolio-images' },
      {
        type: 'row',
        fields: [
          { name: 'title', type: 'text', admin: { width: '40%' } },
          { name: 'year', type: 'number', admin: { width: '20%' } },
          { name: 'medium', type: 'text', admin: { width: '40%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'widthCm', label: 'Width (cm)', type: 'number', admin: { width: '33%' } },
          { name: 'heightCm', label: 'Height (cm)', type: 'number', admin: { width: '33%' } },
          { name: 'depthCm', label: 'Depth (cm)', type: 'number', admin: { width: '33%' } },
        ],
      },
    ],
  },
  {
    name: 'declarations',
    type: 'group',
    admin: { condition: isArtist, readOnly: true },
    fields: [
      {
        name: 'originalWork',
        label: 'The work is their own, and they hold the rights',
        type: 'checkbox',
      },
      { name: 'accurate', label: 'The information is accurate', type: 'checkbox' },
      {
        name: 'consentProcessing',
        label: 'Consented to identity details being processed for verification',
        type: 'checkbox',
      },
      { name: 'consentedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      {
        name: 'privacyNoticeVersion',
        type: 'text',
        admin: { description: 'The privacy notice they agreed to.' },
      },
    ],
  },
]

export const partnerApplicationFields: Field[] = [
  {
    name: 'partner',
    label: 'About the partner',
    type: 'group',
    admin: { condition: isPartner, readOnly: true },
    fields: [
      { name: 'subType', label: 'What describes them', type: 'text' },
      {
        type: 'row',
        fields: [
          { name: 'fullName', type: 'text', admin: { width: '50%' } },
          { name: 'role', type: 'text', admin: { width: '50%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'organisation', type: 'text', admin: { width: '50%' } },
          { name: 'phone', type: 'text', admin: { width: '50%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'city', type: 'text', admin: { width: '50%' } },
          { name: 'state', type: 'text', admin: { width: '50%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'website', type: 'text', admin: { width: '50%' } },
          { name: 'gstin', label: 'GSTIN', type: 'text', admin: { width: '50%' } },
        ],
      },
      { name: 'interest', label: 'What they would like to do together', type: 'textarea' },
      { name: 'message', type: 'textarea' },
    ],
  },
]

/** Where the applicant has got to: steps saved so far, and when they began */
export const progressFields: Field[] = [
  {
    name: 'completedSteps',
    type: 'select',
    hasMany: true,
    options: ['about', 'address', 'practice', 'portfolio', 'kyc', 'review'].map((v) => ({
      label: v,
      value: v,
    })),
    admin: { position: 'sidebar', readOnly: true, condition: isArtist },
  },
]
