import type { Field } from 'payload'

import { CURATOR_AREAS, CURATOR_STATUSES, CURATOR_WANTS, CURATOR_YEARS } from '../curators/rules'
import {
  DIMENSION_UNITS,
  LANGUAGES,
  MEDIUMS,
  PRICE_RANGES,
  RECOGNITION_KINDS,
} from '../members/forms/schemas'

/**
 * What an application holds, step by step. The shapes are checked by the step schemas in
 * src/members/forms/schemas.ts before anything is saved; these are the columns they land in.
 *
 * Read-only in the admin: staff review an application, they do not rewrite it. Decisions are taken
 * with the panel in the sidebar.
 */

const isArtist = (data: Record<string, unknown>) => data?.type === 'artist'
const isPartner = (data: Record<string, unknown>) => data?.type === 'partner'
const isCurator = (data: Record<string, unknown>) => data?.type === 'curator'

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
  {
    type: 'row',
    fields: [
      // Where they pinned their home on the map, if they chose to
      { name: 'latitude', label: 'Map pin: latitude', type: 'number', admin: { width: '50%' } },
      { name: 'longitude', label: 'Map pin: longitude', type: 'number', admin: { width: '50%' } },
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
            label: 'Preferred language (no longer asked)',
            type: 'select',
            options: LANGUAGES.map((l) => ({ label: l, value: l })),
            admin: { width: '33%' },
          },
        ],
      },
      // Given in step 1, against the notice on how PAT & J.K. Co. uses their details
      {
        type: 'row',
        fields: [
          {
            name: 'consentProcessing',
            label: 'Agreed to how PAT & J.K. Co. uses their details',
            type: 'checkbox',
            admin: { width: '50%' },
          },
          {
            name: 'consentedAt',
            label: 'Agreed on',
            type: 'date',
            admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' } },
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
      {
        name: 'yearsPractising',
        label: 'Years making work',
        type: 'number',
        admin: {
          description:
            'The start of the band they chose: 0 is less than a year, 1 is 1 to 2, 3 is 3 to 5, 6 is 6 to 10, 11 is more than 10.',
        },
      },
      { name: 'training', label: 'Training or education', type: 'textarea' },
      { name: 'bio', label: 'Biography', type: 'textarea' },
      { name: 'statement', label: 'Artist statement', type: 'textarea' },
      {
        type: 'row',
        fields: [
          { name: 'website', type: 'text', admin: { width: '33%' } },
          { name: 'instagram', type: 'text', admin: { width: '33%' } },
          { name: 'facebook', type: 'text', admin: { width: '33%' } },
        ],
      },
      {
        name: 'otherSocials',
        label: 'Other platforms',
        type: 'array',
        fields: [
          {
            type: 'row',
            fields: [
              { name: 'platform', type: 'text', admin: { width: '40%' } },
              { name: 'handle', label: 'Link or ID', type: 'text', admin: { width: '60%' } },
            ],
          },
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
          { name: 'details', type: 'textarea' },
        ],
      },
      {
        name: 'recognitionNone',
        label: 'No exhibitions or awards yet',
        type: 'checkbox',
      },
    ],
  },
  {
    name: 'downloadAllPictures',
    type: 'ui',
    admin: {
      condition: isArtist,
      components: { Field: '@/components/admin/PictureDownload#AllPicturesDownload' },
    },
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
        name: 'downloadImage',
        type: 'ui',
        admin: {
          components: { Field: '@/components/admin/PictureDownload#WorkPictureDownload' },
        },
      },
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
          // As the artist gave them, in their unit
          { name: 'width', label: 'Width (as given)', type: 'number', admin: { width: '25%' } },
          { name: 'height', label: 'Height (as given)', type: 'number', admin: { width: '25%' } },
          { name: 'depth', label: 'Depth (as given)', type: 'number', admin: { width: '25%' } },
          {
            name: 'unit',
            type: 'select',
            options: DIMENSION_UNITS.map(({ value, label }) => ({ value, label })),
            admin: { width: '25%' },
          },
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
      { name: 'priceInr', label: 'Price (₹)', type: 'number', admin: { width: '33%' } },
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
      {
        name: 'notCopy',
        label: 'None of the works is a print, a copy, or made with AI',
        type: 'checkbox',
      },
      { name: 'accurate', label: 'The information is accurate', type: 'checkbox' },
      // Asked here before the design moved consent to step 1 (about.consentProcessing)
      {
        name: 'consentProcessing',
        label: 'Consented to identity details being processed (before step 1 asked)',
        type: 'checkbox',
      },
      {
        name: 'consentedAt',
        label: 'Consent saved on the form',
        type: 'date',
        admin: { date: { pickerAppearance: 'dayAndTime' } },
      },
      // From before the privacy policy replaced the Terms & Conditions: kept, never shown
      { name: 'agreeTerms', type: 'checkbox', admin: { hidden: true } },
      { name: 'agreeTyped', label: 'What they typed to agree', type: 'text' },
      { name: 'termsDocument', type: 'upload', relationTo: 'media', admin: { hidden: true } },
      {
        name: 'privacyNoticeVersion',
        label: 'Privacy Policy & Statutory Notice: version',
        type: 'text',
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
      { name: 'subType', label: 'Which describes them best', type: 'text' },
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
          { name: 'country', type: 'text', admin: { width: '33%' } },
          { name: 'city', type: 'text', admin: { width: '33%' } },
          { name: 'state', label: 'State or region', type: 'text', admin: { width: '33%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'website', label: 'Website or portfolio', type: 'text', admin: { width: '50%' } },
          {
            // The one tax number: a GSTIN in India, a company registration or VAT number elsewhere
            name: 'gstin',
            label: 'GSTIN, or company registration or VAT number',
            type: 'text',
            admin: { width: '50%' },
          },
        ],
      },
      { name: 'proof', label: 'Proof of practice', type: 'text' },
      { name: 'interest', label: 'What they would like to do with us', type: 'textarea' },
      { name: 'message', label: 'Anything else', type: 'textarea' },
    ],
  },
  {
    // Written by the server when the application is sent (submitPartnerApplication), never by the
    // partner: what they consented to, and which agreement they agreed to and how
    name: 'partnerDeclarations',
    label: 'Consent and agreement',
    type: 'group',
    access: { create: () => false, update: () => false },
    admin: { condition: isPartner, readOnly: true },
    fields: [
      {
        name: 'consentProcessing',
        label: 'Agreed to how PAT & J.K. Co. uses their details',
        type: 'checkbox',
      },
      {
        name: 'accurate',
        label: 'The details they gave are true and complete',
        type: 'checkbox',
      },
      {
        name: 'privacyNoticeVersion',
        type: 'text',
        admin: { description: 'The privacy notice they agreed to.' },
      },
      {
        name: 'agreementVersion',
        label: 'Partner/Trade Program agreement: version agreed to',
        type: 'text',
      },
      {
        name: 'agreedAt',
        label: 'Agreed on',
        type: 'date',
        admin: { date: { pickerAppearance: 'dayAndTime' } },
      },
      {
        name: 'agreementConfirmation',
        label: 'How they agreed',
        type: 'text',
      },
      {
        name: 'agreementDigest',
        label: 'Digest of the text agreed to',
        type: 'text',
        admin: {
          description:
            'SHA-256 of the agreement’s words when they agreed, so the exact text can be told apart from a later edit.',
        },
      },
    ],
  },
]

const locked = () => false

const options = (list: readonly { value: string; label: string }[]) =>
  list.map(({ value, label }) => ({ value, label }))

/**
 * A guest curator's application (the ApplyCurator design): everything on the form, as sent. No
 * account stands behind it, so it is written by the server alone and read only by staff. The
 * portfolio and CV are encrypted in the private store and opened through the Curators screen.
 */
export const curatorApplicationFields: Field[] = [
  {
    name: 'curator',
    label: 'About the curator',
    type: 'group',
    access: { create: locked, update: locked },
    admin: { condition: isCurator, readOnly: true },
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'fullName', type: 'text', admin: { width: '50%' } },
          { name: 'email', type: 'email', index: true, admin: { width: '50%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'phone', type: 'text', admin: { width: '33%' } },
          { name: 'country', type: 'text', admin: { width: '33%' } },
          { name: 'city', type: 'text', admin: { width: '33%' } },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'role', label: 'Current role', type: 'text', admin: { width: '50%' } },
          {
            name: 'years',
            label: 'Years curating',
            type: 'select',
            options: options(CURATOR_YEARS),
            admin: { width: '50%' },
          },
        ],
      },
      {
        name: 'areas',
        label: 'What they curate',
        type: 'select',
        hasMany: true,
        options: options(CURATOR_AREAS),
      },
      { name: 'languages', label: 'Languages they work in', type: 'text' },
      { name: 'portfolioLink', label: 'Portfolio link', type: 'text' },
      {
        name: 'projects',
        label: 'Past projects',
        type: 'array',
        fields: [
          {
            type: 'row',
            fields: [
              { name: 'title', type: 'text', admin: { width: '70%' } },
              { name: 'year', type: 'text', admin: { width: '30%' } },
            ],
          },
          {
            type: 'row',
            fields: [
              { name: 'place', label: 'Where, or for whom', type: 'text', admin: { width: '50%' } },
              { name: 'role', label: 'Their role', type: 'text', admin: { width: '50%' } },
            ],
          },
          { name: 'link', type: 'text' },
        ],
      },
      {
        name: 'wants',
        label: 'Would like to work on',
        type: 'select',
        options: options(CURATOR_WANTS),
      },
      { name: 'idea', label: 'A collection they would like to curate', type: 'textarea' },
      {
        type: 'row',
        fields: [
          { name: 'fee', label: 'Usual fee', type: 'text', admin: { width: '50%' } },
          { name: 'start', label: 'Could start', type: 'text', admin: { width: '50%' } },
        ],
      },
    ],
  },
  {
    // What the curator ticked, recorded by the server when the application was sent
    name: 'curatorDeclarations',
    label: 'Consent',
    type: 'group',
    access: { create: locked, update: locked },
    admin: { condition: isCurator, readOnly: true },
    fields: [
      {
        name: 'consentProcessing',
        label: 'Agreed to how PAT & J.K. Co. uses their details',
        type: 'checkbox',
      },
      { name: 'adult', label: 'Confirmed they are 18 or over', type: 'checkbox' },
      {
        name: 'accurate',
        label: 'Their portfolio and projects are described accurately',
        type: 'checkbox',
      },
      { name: 'keepOnFile', label: 'Asked to be kept on file for 12 months', type: 'checkbox' },
      {
        name: 'privacyNoticeVersion',
        type: 'text',
        admin: { description: 'The notice they agreed to.' },
      },
    ],
  },
  {
    // The portfolio PDF and the CV, written by the server once every part has arrived
    name: 'curatorFiles',
    type: 'array',
    access: { create: locked, update: locked },
    admin: { hidden: true },
    fields: [
      {
        name: 'kind',
        type: 'select',
        required: true,
        options: [
          { label: 'Portfolio', value: 'portfolio' },
          { label: 'CV', value: 'cv' },
        ],
      },
      { name: 'filename', type: 'text', required: true },
      { name: 'contentType', type: 'text', required: true },
      { name: 'size', type: 'number' },
      { name: 'storageKey', type: 'text', required: true, access: { read: locked } },
      { name: 'keyId', type: 'text', required: true, access: { read: locked } },
      { name: 'wrappedKey', type: 'text', required: true, access: { read: locked } },
    ],
  },
  {
    // While the files arrive: a hash of the upload token, when it lapses, the folder, and the
    // files promised with the parts received so far. Cleared once the application is sent
    name: 'curatorUpload',
    type: 'group',
    access: { read: locked, create: locked, update: locked },
    admin: { hidden: true },
    fields: [
      { name: 'tokenHash', type: 'text' },
      { name: 'expiresAt', type: 'date' },
      { name: 'folder', type: 'text' },
      { name: 'files', type: 'json' },
    ],
  },
  {
    // Set to New by the server when the application arrives; empty on artist and partner ones
    name: 'curatorStatus',
    label: 'Status',
    type: 'select',
    index: true,
    options: options(CURATOR_STATUSES),
    admin: {
      position: 'sidebar',
      condition: isCurator,
      description: 'Changed from the Curators screen, as its emails are sent.',
    },
  },
  {
    name: 'curatorProject',
    label: 'Project',
    type: 'text',
    admin: { position: 'sidebar', condition: isCurator },
  },
  {
    // Added from the Curators screen; never changed afterwards
    name: 'teamNotes',
    label: 'Team notes',
    type: 'array',
    access: { create: locked, update: locked },
    admin: { condition: isCurator, readOnly: true },
    fields: [
      { name: 'note', type: 'textarea', required: true },
      { name: 'by', type: 'text' },
      { name: 'at', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    ],
  },
  {
    // Each email the team sent from the Curators screen, as it went
    name: 'curatorEmails',
    label: 'Emails sent',
    type: 'array',
    access: { create: locked, update: locked },
    admin: { condition: isCurator, readOnly: true, initCollapsed: true },
    fields: [
      {
        name: 'kind',
        type: 'select',
        options: [
          { label: 'We would like to talk', value: 'talk' },
          { label: 'Not this time', value: 'decline' },
        ],
      },
      { name: 'subject', type: 'text' },
      { name: 'body', type: 'textarea' },
      { name: 'by', type: 'text' },
      { name: 'at', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
    ],
  },
]

/** Where the applicant has got to: steps saved so far, and when they began */

/**
 * The consent given each time an application is sent, artist or partner (src/members/consentRecord.ts):
 * the box ticked and I AGREE typed, the Privacy Policy & Statutory Notice as shown with its version
 * and SHA-256, the IP address, the coarse location and the time. Written by the server alone
 * (overrideAccess) and never changed: no one, staff included, can create or edit a row.
 */
export const consentRecordFields: Field[] = [
  {
    name: 'consentRecord',
    label: 'Consent record',
    type: 'array',
    access: { create: locked, update: locked },
    admin: {
      readOnly: true,
      initCollapsed: false,
      description:
        'One row each time the application was sent. Recorded by the server and locked: it cannot be edited.',
    },
    labels: { singular: 'Consent', plural: 'Consents' },
    fields: [
      {
        name: 'submittedAt',
        label: 'Submitted',
        type: 'date',
        admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'd MMM yyyy, HH:mm:ss' } },
      },
      { name: 'consentChecked', label: 'Ticked the consent box', type: 'checkbox' },
      { name: 'typed', label: 'Typed (I AGREE)', type: 'text' },
      { name: 'policyTitle', label: 'Document agreed to', type: 'text' },
      { name: 'policyVersion', label: 'Version', type: 'text' },
      { name: 'policySha256', label: 'SHA-256 of the text agreed to', type: 'text' },
      { name: 'ip', label: 'IP address', type: 'text' },
      { name: 'location', label: 'Coarse location', type: 'text' },
      { name: 'userAgent', label: 'Browser', type: 'text' },
      {
        name: 'policyText',
        label: 'Text agreed to (Privacy Policy & Statutory Notice, Pre-Submission DPDP notice)',
        type: 'textarea',
      },
    ],
  },
]

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
