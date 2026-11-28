import { z } from 'zod'

import {
  isAadhaarLast4,
  looksLikeFullAadhaar,
  normalisePan,
  panProblem,
} from './values'

/**
 * "Confirm who you are": the identity check after approval (the founder's Verify design and brief
 * of 25 November 2026, sections 9 and 11). Shared by the browser and the server; the server's
 * check is the one that counts.
 *
 *   in India    a PAN, the name on it and a photo of the card; then, for artists, a masked
 *               e-Aadhaar (the last four digits only) or a passport, voter ID or driving licence
 *   elsewhere   a passport: number, issuing country, expiry, the name on it and its photo page;
 *               then, for artists, a national identity card, residence permit or driving licence
 *   everyone    a photo of them holding a paper with a ten-minute code, their name as on the
 *               PAN or passport and (artists) their date of birth
 *
 * Trade partners give the PAN or passport and the photo only. The page follows the application's
 * country, and either way can be switched ("Live outside India? Use your passport instead.").
 */

export type VerifyKind = 'artist' | 'partner'
export type PrimaryId = 'pan' | 'passport'

export const VERIFY_NOTICE_VERSION = '2026-11-25'

/** The second ID an artist outside India may give: both are checked by hand */
export const ABROAD_SECOND_IDS = ['national-id', 'driving-licence'] as const
export type AbroadSecondId = (typeof ABROAD_SECOND_IDS)[number]

/** The founder's wording (error document of 25 November 2026, section 4) */
export const VERIFY_ERRORS = {
  consent: 'Please tick the box to agree before we take your identity details.',
  consentTyped: 'Please type I AGREE in capitals to confirm.',
  noticeChanged:
    'The privacy notice has changed since you read it. Please read it again and confirm.',
  pan: 'Please give your PAN.',
  panFormat:
    'A PAN has ten characters: five letters, four digits, then a letter, for example ABCDE1234F.',
  panBusiness: 'That looks like a business PAN. Please give your own personal PAN.',
  panName: 'Please give your name exactly as it is printed on your PAN card.',
  nameLength: 'Please keep this to 120 characters or fewer.',
  panCard: 'Please add a photo of your PAN card, with your face, name and number easy to read.',
  passportNumber: 'Please give your passport number.',
  passportCountry: 'Please give the country that issued your passport.',
  passportExpiry: 'Please give the date your passport is valid until.',
  passportExpired: 'This passport has expired. Please use one that is still valid.',
  passportName: 'Please give your name exactly as it is printed on your passport.',
  passportPage:
    'Please add a photo of your passport’s photo page, with the two lines of code at the bottom showing.',
  idChoice: 'Please choose which ID you are giving us.',
  abroadSecondId:
    'Please add a national identity card, residence permit or driving licence that shows your address.',
  aadhaarFile: 'Please upload your masked e-Aadhaar.',
  aadhaarLast4: 'Please give the last four digits shown on your masked e-Aadhaar.',
  aadhaarWhole: 'Please give only the last four digits, not the whole Aadhaar number.',
  aadhaarNotChecked: 'We could not check your masked e-Aadhaar automatically.',
  otherId: 'Please upload a copy of your ID.',
  addressMatches: 'Please tell us whether the address on it matches the one in your application.',
  addressNote: 'Please tell us in a line why the address is different.',
  addressProof: 'As the address is different, please also upload proof of your current address.',
  photo: 'Please add the photo of you holding the paper with your code, name and date of birth.',
  photoPartner: 'Please add the photo of you holding the paper with your code and name.',
  photoRetake: 'Please take the photo again.',
  photoChanged:
    'Your name or date of birth has changed since this photo was taken. Please ask for a new code and take it again.',
  missingDocument: 'We could not find one of your documents. Please upload it again.',
  notSaved: 'Your details could not be saved. Please try again.',
  closed: 'These details have been sent for checking, so they can no longer be changed here.',
  notApproved:
    'This page is for applicants we have approved. Your account has nothing to confirm yet.',
  codeWindow: 'A code can only be given while your details are open for checking.',
  photoWindow: 'The photo can only be added while your details are open for checking.',
  nameFirst: (doc: string) => `Please give your name as it is on your ${doc} before adding the photo.`,
} as const

const documentId = z.coerce.number().int().positive().optional()
const short = (max: number) => z.string().max(max, VERIFY_ERRORS.nameLength).optional()

const shape = z.object({
  consent: z.boolean().optional(),
  consentTyped: z.string().max(40).optional(),
  noticeVersion: z.string().max(40).optional(),
  primary: z.enum(['pan', 'passport']).optional(),
  pan: z.string().max(20).optional(),
  panName: short(120),
  passportNumber: z.string().max(20).optional(),
  passportCountry: z.string().max(80).optional(),
  passportExpiry: z.string().max(10).optional(),
  passportName: short(120),
  idChoice: z.enum(['aadhaar', 'other']).optional(),
  aadhaarLast4: z.string().max(20).optional(),
  aadhaarPassword: z.string().max(64).optional(),
  abroadId: z.enum(ABROAD_SECOND_IDS).optional(),
  addressOnIdMatches: z.boolean().optional(),
  addressNote: z.string().max(300, 'Please keep this to 300 characters or fewer.').optional(),
  documents: z
    .object({
      'pan-card': documentId,
      'passport-page': documentId,
      'masked-aadhaar': documentId,
      'other-id': documentId,
      'address-proof': documentId,
      'identity-photo': documentId,
    })
    .default({}),
})

export type VerifyDocuments = z.infer<typeof shape>['documents']

const isoDate = /^\d{4}-\d{2}-\d{2}$/
const todayIso = () => new Date().toISOString().slice(0, 10)

/** A passport number: letters and digits, five to twenty of them, as countries print them */
export const normalisePassport = (value: string) => value.replace(/[\s-]/g, '').toUpperCase()
const PASSPORT_PATTERN = /^[A-Z0-9]{5,20}$/

/** A passport number shown to anyone, member or staff: the last three characters only */
export const maskPassport = (value: string) => {
  const number = normalisePassport(value)
  return `${'x'.repeat(Math.max(0, number.length - 3))}${number.slice(-3)}`
}

/** What is kept: only the answers for the ID chosen, cleaned, and the documents that go with them */
export type VerifyInput = {
  kind: VerifyKind
  primary: PrimaryId
  pan?: string
  panName?: string
  passportNumber?: string
  passportCountry?: string
  passportExpiry?: string
  passportName?: string
  /** The name on the PAN or passport: written on the paper in the photo */
  nameOnId: string
  idChoice?: 'aadhaar' | 'other'
  aadhaarLast4?: string
  aadhaarPassword?: string
  /** For a second ID: passport, voter ID or driving licence in India; the abroad two elsewhere */
  otherIdKind?: AbroadSecondId | null
  addressOnIdMatches?: boolean
  addressNote?: string
  documents: VerifyDocuments
  consentTyped: string
  noticeVersion?: string
}

const clean = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/**
 * Checks the whole page, every problem at once, for sending. `draft` checks only shapes and
 * lengths, for "Save and finish later": what is there is kept, and nothing is asked for yet.
 */
export const checkVerify = (
  kind: VerifyKind,
  body: unknown,
  { draft = false }: { draft?: boolean } = {},
):
  | { ok: true; input: VerifyInput }
  | { ok: false; errors: Record<string, string> } => {
  const parsed = shape.safeParse(body ?? {})
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (!errors[key]) errors[key] = issue.message
    }
    return { ok: false, errors }
  }
  const v = parsed.data
  const errors: Record<string, string> = {}
  const need = (key: string, ok: unknown, message: string) => {
    if (!draft && !ok && !errors[key]) errors[key] = message
  }
  const docs = v.documents
  const primary: PrimaryId = v.primary ?? 'pan'

  const pan = normalisePan(clean(v.pan))
  const panName = clean(v.panName)
  const passportNumber = normalisePassport(clean(v.passportNumber))
  const passportCountry = clean(v.passportCountry)
  const passportExpiry = clean(v.passportExpiry)
  const passportName = clean(v.passportName)

  if (primary === 'pan') {
    if (!pan) need('pan', false, VERIFY_ERRORS.pan)
    else if (!draft) {
      const problem = panProblem(pan)
      if (problem === 'format') errors.pan = VERIFY_ERRORS.panFormat
      else if (problem === 'not-individual') errors.pan = VERIFY_ERRORS.panBusiness
    }
    need('panName', panName, VERIFY_ERRORS.panName)
    need('documents.pan-card', docs['pan-card'], VERIFY_ERRORS.panCard)
  } else {
    need('passportNumber', passportNumber, VERIFY_ERRORS.passportNumber)
    if (!draft && passportNumber && !PASSPORT_PATTERN.test(passportNumber))
      errors.passportNumber = VERIFY_ERRORS.passportNumber
    need('passportCountry', passportCountry, VERIFY_ERRORS.passportCountry)
    if (!passportExpiry) need('passportExpiry', false, VERIFY_ERRORS.passportExpiry)
    else if (!isoDate.test(passportExpiry) || Number.isNaN(Date.parse(passportExpiry)))
      errors.passportExpiry = VERIFY_ERRORS.passportExpiry
    else if (!draft && passportExpiry < todayIso())
      errors.passportExpiry = VERIFY_ERRORS.passportExpired
    need('passportName', passportName, VERIFY_ERRORS.passportName)
    need('documents.passport-page', docs['passport-page'], VERIFY_ERRORS.passportPage)
  }

  // Artists give a second ID, with their address on it; trade partners do not
  let idChoice: VerifyInput['idChoice']
  let aadhaarLast4: string | undefined
  let otherIdKind: VerifyInput['otherIdKind']
  if (kind === 'artist') {
    if (primary === 'pan') {
      idChoice = v.idChoice
      need('idChoice', idChoice, VERIFY_ERRORS.idChoice)
      if (idChoice === 'aadhaar') {
        const digits = clean(v.aadhaarLast4)
        // Never accept, keep or repeat a whole Aadhaar number
        if (looksLikeFullAadhaar(digits)) errors.aadhaarLast4 = VERIFY_ERRORS.aadhaarWhole
        else if (!draft && digits && !isAadhaarLast4(digits))
          errors.aadhaarLast4 = VERIFY_ERRORS.aadhaarLast4
        else need('aadhaarLast4', digits, VERIFY_ERRORS.aadhaarLast4)
        aadhaarLast4 = isAadhaarLast4(digits) ? digits : undefined
        need('documents.masked-aadhaar', docs['masked-aadhaar'], VERIFY_ERRORS.aadhaarFile)
      } else if (idChoice === 'other') {
        need('documents.other-id', docs['other-id'], VERIFY_ERRORS.otherId)
      }
    } else {
      idChoice = 'other'
      otherIdKind = v.abroadId
      need('abroadId', otherIdKind, VERIFY_ERRORS.idChoice)
      need('documents.other-id', docs['other-id'], VERIFY_ERRORS.abroadSecondId)
    }
    need('addressOnIdMatches', typeof v.addressOnIdMatches === 'boolean', VERIFY_ERRORS.addressMatches)
    if (v.addressOnIdMatches === false) {
      need('addressNote', clean(v.addressNote), VERIFY_ERRORS.addressNote)
      need('documents.address-proof', docs['address-proof'], VERIFY_ERRORS.addressProof)
    }
  }

  need(
    'documents.identity-photo',
    docs['identity-photo'],
    kind === 'artist' ? VERIFY_ERRORS.photo : VERIFY_ERRORS.photoPartner,
  )
  need('consent', v.consent === true, VERIFY_ERRORS.consent)
  need('consentTyped', v.consentTyped === 'I AGREE', VERIFY_ERRORS.consentTyped)

  if (Object.keys(errors).length) return { ok: false, errors }

  // Only the documents of the choices made go with the record
  const documents: VerifyDocuments = { 'identity-photo': docs['identity-photo'] }
  if (primary === 'pan') documents['pan-card'] = docs['pan-card']
  else documents['passport-page'] = docs['passport-page']
  if (kind === 'artist') {
    if (idChoice === 'aadhaar') documents['masked-aadhaar'] = docs['masked-aadhaar']
    if (idChoice === 'other') documents['other-id'] = docs['other-id']
    if (v.addressOnIdMatches === false) documents['address-proof'] = docs['address-proof']
  }

  return {
    ok: true,
    input: {
      kind,
      primary,
      ...(primary === 'pan'
        ? { pan: pan || undefined, panName: panName || undefined }
        : {
            passportNumber: passportNumber || undefined,
            passportCountry: passportCountry || undefined,
            passportExpiry: passportExpiry || undefined,
            passportName: passportName || undefined,
          }),
      nameOnId: primary === 'pan' ? panName : passportName,
      idChoice,
      aadhaarLast4,
      aadhaarPassword: idChoice === 'aadhaar' ? v.aadhaarPassword || undefined : undefined,
      otherIdKind: otherIdKind ?? null,
      addressOnIdMatches: kind === 'artist' ? v.addressOnIdMatches : undefined,
      addressNote:
        kind === 'artist' && v.addressOnIdMatches === false ? clean(v.addressNote) : undefined,
      documents,
      consentTyped: v.consentTyped === 'I AGREE' ? 'I AGREE' : '',
      noticeVersion: v.noticeVersion,
    },
  }
}

/** "What we ask for", by who is asking and where they live */
export const verifyAskFor = (kind: VerifyKind, primary: PrimaryId) =>
  kind === 'partner'
    ? 'Your PAN, or outside India your passport, and a photo of you holding a short code.'
    : primary === 'pan'
      ? 'Your PAN, a second ID that shows your address, and a photo of you holding a short code.'
      : 'Your passport, a national identity card, residence permit or driving licence that shows your address, and a photo of you holding a short code.'

/** How the details are used: the Verify design's words, shown above the tick box */
export const verifyNotice = (askFor: string) => [
  { term: 'What we ask for', text: askFor },
  {
    term: 'Why',
    text: 'To be sure who you are before we sign an agreement, and to keep the records the tax laws ask of us when we pay you. Bank details are asked for separately, in your account, and never by email.',
  },
  {
    term: 'How it is kept',
    text: 'Encrypted when it reaches us and when it is stored. Only the few people at PJK who check it can see it, and every look is recorded. We never sell or share it.',
  },
  {
    term: 'How long we keep it',
    text: 'If the agreement is not signed, we delete these documents within 90 days. Once we have paid you, the tax laws require us to keep some records for up to eight years.',
  },
  {
    term: 'Your rights',
    text: 'You can see, correct or delete your details, or withdraw your consent, from your account or by writing to compliance@pjk.co.in. You can also complain to the Data Protection Board of India.',
  },
]

export const VERIFY_CHECKBOX =
  'I have read how PAT & J.K. Co. will use my identity details, and I agree to it.'
