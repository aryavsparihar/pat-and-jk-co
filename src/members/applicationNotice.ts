/**
 * "How we use your details": the notice in step 1 of the artist application (the Apply1 design,
 * brief of 25 November 2026), word for word. The page shows it, and the consent record keeps it
 * exactly as shown, with its version, against the person who agreed (src/members/consentRecord.ts).
 *
 * Bump the version whenever the wording changes, so every consent kept says which wording it was.
 */
export const ARTIST_NOTICE_VERSION = '2026-11-25'

export const ARTIST_NOTICE_HEADING = 'How we use your details'

export const ARTIST_NOTICE_INTRO =
  'Please read this before you go on. It covers everything you give us in this application.'

export const ARTIST_NOTICE: { term: string; text: string }[] = [
  {
    term: 'What we ask for',
    text: 'Your name, date of birth, mobile number and address; details of your practice; and photographs of your work.',
  },
  {
    term: 'Why',
    text: 'To consider your application for Phulhaar Gallery, and to write to you about it.',
  },
  {
    term: 'Who sees it',
    text: 'Only the few people at PAT & J.K. Co. who review applications. We never sell it, and we never show it publicly.',
  },
  {
    term: 'How long we keep it',
    text: 'If we do not go ahead, we delete your application within 90 days. If we do, we confirm who you are later, with its own notice.',
  },
  {
    term: 'Your rights',
    text: 'You can see, correct or delete your details, or withdraw your consent, from your account or by writing to compliance@pjk.co.in. You can also complain to the Data Protection Board of India.',
  },
]

export const ARTIST_NOTICE_CHECKBOX =
  'I have read how PAT & J.K. Co. will use my details, and I agree to it.'

/** The three statements ticked before sending (the Apply5 design) */
export const ARTIST_DECLARATIONS = {
  originalWork: 'The works I have shown are my own original work, and I hold the rights to them.',
  notCopy: 'None of them is a print, a copy, or made wholly or partly with AI.',
  accurate: 'The details I have given are true and complete.',
} as const

/** Everything the applicant was shown and agreed to, as one text for the consent record */
export const artistNoticeText = (): string =>
  [
    ARTIST_NOTICE_HEADING,
    ARTIST_NOTICE_INTRO,
    ...ARTIST_NOTICE.map(({ term, text }) => `${term}: ${text}`),
    ARTIST_NOTICE_CHECKBOX,
    'Before you send it:',
    ...Object.values(ARTIST_DECLARATIONS),
    'To confirm, type I AGREE',
  ].join('\n\n')
