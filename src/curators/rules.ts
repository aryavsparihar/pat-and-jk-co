/**
 * The guest curator form (the founder's ApplyCurator design and brief of 25 November 2026): what
 * it asks, what it accepts, and what it says when something is wrong (error messages, section
 * 10). Used by the browser, the server and the admin alike.
 *
 * No account is needed. The portfolio may be a link or a PDF of up to 20 MB, and the CV a PDF or
 * Word file of up to 5 MB. A request to the site may carry at most 4.5 MB, so the files travel in
 * parts, as the contact form's do (src/contact/flow.ts).
 */

export const CURATOR_YEARS = [
  { value: 'under-2', label: 'Less than 2 years' },
  { value: '2-5', label: '2 to 5 years' },
  { value: '6-10', label: '6 to 10 years' },
  { value: 'over-10', label: 'More than 10 years' },
] as const

export const CURATOR_AREAS = [
  { value: 'contemporary', label: 'Contemporary art' },
  { value: 'modern', label: 'Modern and 20th-century art' },
  { value: 'miniature-traditional', label: 'Miniature and traditional painting' },
  { value: 'craft-design', label: 'Craft and design' },
  { value: 'sculpture-objects', label: 'Sculpture and objects' },
  { value: 'interiors-hospitality', label: 'Art for interiors and hospitality' },
  { value: 'private-collections', label: 'Private collections' },
  { value: 'events-sets', label: 'Events, and film, stage or photo sets' },
  { value: 'other', label: 'Something else' },
] as const

export const CURATOR_WANTS = [
  { value: 'phulhaar', label: 'Collections for Phulhaar Gallery' },
  {
    value: 'clients',
    label: 'Projects for PJK’s clients',
    hint: 'Private collections and events, and film, stage or photography sets.',
  },
  { value: 'both', label: 'Both' },
] as const

/** Where the team has got to with a curator: the admin Curators screen */
export const CURATOR_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'talking', label: 'Talking' },
  { value: 'working', label: 'Working with us' },
  { value: 'on-file', label: 'On file' },
  { value: 'not-this-time', label: 'Not this time' },
] as const

export type CuratorStatus = (typeof CURATOR_STATUSES)[number]['value']

/** Still open: a second application from the same address is refused while one is */
export const OPEN_STATUSES: CuratorStatus[] = ['new', 'talking', 'working']

export const PROJECTS_MIN = 2
export const PROJECTS_MAX = 3

export const PORTFOLIO_MAX_BYTES = 20 * 1024 * 1024
export const CV_MAX_BYTES = 5 * 1024 * 1024

export const NAME_MAX = 120
export const TEXT_MAX = 200
export const IDEA_MAX = 1000

export const CV_ACCEPT = '.pdf,.doc,.docx'
export const PORTFOLIO_ACCEPT = '.pdf'

export const CURATOR_ERRORS = {
  consent: 'Please tick the box to agree to how we will use your details.',
  fullName: 'Please give your full name.',
  email: 'Please enter a full email address, for example name@example.com.',
  country: 'Please choose your country.',
  city: 'Please add your city.',
  age: 'Please confirm that you are 18 or over.',
  role: 'Please tell us your current role.',
  years: 'Please choose how many years you have been curating.',
  areas: 'Please choose at least one area.',
  portfolio: 'Please add a link to your portfolio, or upload it as a PDF.',
  portfolioLarge:
    'Your portfolio is larger than 20 MB. Please send a smaller copy, or a link instead.',
  portfolioType: 'Your portfolio needs to be a PDF.',
  cv: 'Please add your CV.',
  cvType: 'Your CV needs to be a PDF or Word file.',
  cvLarge: 'Your CV is larger than 5 MB. Please send a smaller copy.',
  projects: 'Please tell us about at least two past projects.',
  projectTitle: 'Please give the project a title.',
  projectYear: 'Please give the year.',
  projectPlace: 'Please say where it was, or for whom.',
  projectRole: 'Please tell us what your own part was.',
  wants: 'Please choose what you would like to work on.',
  accurate: 'Please confirm that your portfolio and projects are described accurately.',
  already:
    'We already have an application from this email address, and will reply within seven days.',
  failed: 'Your application could not be sent. Please try again in a minute.',
  ourSide: 'Something went wrong on our side. Please try again.',
  link: 'Please check the link. It should start with https://',
} as const

/** The statements ticked before sending, as shown */
export const CURATOR_ACCURATE =
  'My portfolio and projects are described accurately, and I have the right to share them.'
export const CURATOR_KEEP_ON_FILE =
  'Keep my application on file for 12 months, so you can write if a later project suits me.'
export const CURATOR_ADULT = 'I am 18 or over.'

/** "How we use your details", as the design words it for curators */
export const CURATOR_NOTICE_VERSION = '2026-11-25'

export const CURATOR_NOTICE: { term: string; text: string }[] = [
  {
    term: 'What we ask for',
    text: 'Your name, email, phone, city and country, your CV and portfolio, and details of past projects.',
  },
  { term: 'Why', text: 'To consider you for curatorial projects, and to write to you about them.' },
  {
    term: 'Who sees it',
    text: 'Only the few people at PAT & J.K. Co. who review applications. We never sell it.',
  },
  {
    term: 'How long we keep it',
    text: 'If we do not work together, we delete your application within 90 days, unless you ask us below to keep it on file.',
  },
  {
    term: 'Your rights',
    text: 'You can see, correct or delete your details, or withdraw your consent, by writing to compliance@pjk.co.in. You can also complain to the Data Protection Board of India.',
  },
]

export const CURATOR_NOTICE_CHECKBOX =
  'I have read how PAT & J.K. Co. will use my details, and I agree to it.'

/** Everything the curator was shown and agreed to, as one text for the consent record */
export const curatorNoticeText = (): string =>
  [
    'How we use your details',
    ...CURATOR_NOTICE.map(({ term, text }) => `${term}: ${text}`),
    CURATOR_NOTICE_CHECKBOX,
    CURATOR_ADULT,
    CURATOR_ACCURATE,
  ].join('\n\n')

export const labelOf = (
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string => list.find((o) => o.value === value)?.label ?? value ?? ''
