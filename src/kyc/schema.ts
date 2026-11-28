import { z } from 'zod'

import {
  isAadhaarLast4,
  isAccountNumber,
  isIfsc,
  looksLikeFullAadhaar,
  normaliseAccount,
  normaliseIfsc,
  normalisePan,
  panProblem,
} from './values'

/**
 * What the KYC step accepts. Shared by the browser and the server; the server's check is the one
 * that counts. Messages explain plainly and never repeat the value back.
 */

export const KYC_DOCUMENT_KINDS = [
  'pan-card',
  // Outside India: the passport's photo page, in place of the PAN card
  'passport-page',
  'masked-aadhaar',
  'other-id',
  'address-proof',
  'bank-proof',
  // A photo of the artist holding a paper with their identity code and full name written on it
  'identity-photo',
  // Signing an agreement after approval (src/agreements): the photo with its code, the PDF as the
  // member signed it, and the copy countersigned with PAT & J.K. Co.'s DSC
  'agreement-photo',
  'agreement-signed',
  'agreement-countersigned',
] as const
export type KycDocumentKind = (typeof KYC_DOCUMENT_KINDS)[number]

const documentId = z.coerce.number().int().positive().optional()

/** The founder's wording for payout details (error document of 25 November 2026, section 7) */
export const BANK_ERRORS = {
  holderName: 'Please give the name on the account, as the bank has it.',
  notOwnName: 'The account must be in your own name. We cannot pay into anyone else’s account.',
  accountNumber: 'Please give your account number.',
  accountLength: 'An account number has 9 to 18 digits.',
  accountAgain: 'Please type your account number again.',
  accountsDiffer: 'The two account numbers do not match. Please type it again.',
  ifsc: 'Please give the IFSC.',
  ifscFormat: 'An IFSC has 11 characters: four letters, a zero, then six letters or digits.',
  bankName: 'Please give the name of the bank.',
  branchName: 'Please give the branch.',
  accountType: 'Please choose savings or current.',
  bankCountry: 'Please choose the country where your bank is.',
  iban: 'Please give your IBAN or account number.',
  ibanWrong: 'That IBAN does not look right. Please check it.',
  swift: 'A SWIFT or BIC code has 8 or 11 characters.',
  bankAddress: 'Please give the bank’s name and branch address.',
  currency: 'Please give the account’s currency, for example GBP.',
} as const

/** Letters and digits only, in capitals: how IBANs, foreign account numbers and SWIFT codes are kept */
export const normaliseCode = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase()

/** An IBAN's own check (ISO 13616): move the first four to the end, letters to numbers, mod 97 */
export const ibanChecks = (iban: string) => {
  const moved = iban.slice(4) + iban.slice(0, 4)
  let rest = 0
  for (const ch of moved) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97
  }
  return rest === 1
}
const looksLikeIban = (value: string) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(value)
const SWIFT_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/

const optionalText = z.string().max(300, 'Please keep this to 300 characters or fewer.').optional()

/**
 * Where an approved artist is paid. Not part of the application: asked for only when a sale needs
 * a payout, from the artist's account, after a fresh emailed code (docs/KYC.md#payout-details).
 * A bank in India gives the IFSC and account details; a bank elsewhere gives its country, the
 * IBAN or account number, the SWIFT or BIC code, its name and branch address, and the currency.
 */
export const bankSchema = z
  .object({
    location: z.enum(['india', 'abroad']).default('india'),
    holderName: optionalText,
    accountNumber: z.string().max(60).optional(),
    accountNumberConfirm: z.string().max(60).optional(),
    ifsc: z.string().max(20).optional(),
    bankName: optionalText,
    branchName: optionalText,
    accountType: z.enum(['savings', 'current']).optional(),
    bankCountry: z.string().max(80).optional(),
    swift: z.string().max(20).optional(),
    bankAddress: optionalText,
    currency: z.string().max(10).optional(),
  })
  .superRefine(
    (value, ctx) => {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message })
      const t = (x?: string) => (x ?? '').trim()
      if (!t(value.holderName)) issue('holderName', BANK_ERRORS.holderName)
      if (value.location === 'india') {
        const account = normaliseAccount(value.accountNumber ?? '')
        if (!account) issue('accountNumber', BANK_ERRORS.accountNumber)
        else if (!isAccountNumber(account)) issue('accountNumber', BANK_ERRORS.accountLength)
        const again = normaliseAccount(value.accountNumberConfirm ?? '')
        if (!again) issue('accountNumberConfirm', BANK_ERRORS.accountAgain)
        else if (account && again !== account)
          issue('accountNumberConfirm', BANK_ERRORS.accountsDiffer)
        const ifsc = normaliseIfsc(value.ifsc ?? '')
        if (!ifsc) issue('ifsc', BANK_ERRORS.ifsc)
        else if (!isIfsc(ifsc)) issue('ifsc', BANK_ERRORS.ifscFormat)
        if (!t(value.bankName)) issue('bankName', BANK_ERRORS.bankName)
        if (!t(value.branchName)) issue('branchName', BANK_ERRORS.branchName)
        if (!value.accountType) issue('accountType', BANK_ERRORS.accountType)
      } else {
        if (!t(value.bankCountry)) issue('bankCountry', BANK_ERRORS.bankCountry)
        const account = normaliseCode(value.accountNumber ?? '')
        if (!account) issue('accountNumber', BANK_ERRORS.iban)
        else if (looksLikeIban(account) && !ibanChecks(account))
          issue('accountNumber', BANK_ERRORS.ibanWrong)
        else if (account.length < 4 || account.length > 34) issue('accountNumber', BANK_ERRORS.iban)
        const again = normaliseCode(value.accountNumberConfirm ?? '')
        if (!again) issue('accountNumberConfirm', BANK_ERRORS.accountAgain)
        else if (account && again !== account)
          issue('accountNumberConfirm', BANK_ERRORS.accountsDiffer)
        if (!SWIFT_PATTERN.test(normaliseCode(value.swift ?? ''))) issue('swift', BANK_ERRORS.swift)
        if (!t(value.bankAddress)) issue('bankAddress', BANK_ERRORS.bankAddress)
        if (!/^[A-Za-z]{3}$/.test(t(value.currency))) issue('currency', BANK_ERRORS.currency)
      }
    },
    // Run even when another field is wrong, so every problem is listed at once
    { when: () => true },
  )
  .transform((value) => {
    const t = (x?: string) => (x ?? '').trim()
    return value.location === 'india'
      ? {
          location: 'india' as const,
          holderName: t(value.holderName),
          accountNumber: normaliseAccount(value.accountNumber ?? ''),
          ifsc: normaliseIfsc(value.ifsc ?? ''),
          bankName: t(value.bankName),
          branchName: t(value.branchName),
          accountType: value.accountType ?? ('savings' as const),
        }
      : {
          location: 'abroad' as const,
          holderName: t(value.holderName),
          accountNumber: normaliseCode(value.accountNumber ?? ''),
          bankCountry: t(value.bankCountry),
          swift: normaliseCode(value.swift ?? ''),
          bankAddress: t(value.bankAddress),
          currency: t(value.currency).toUpperCase(),
        }
  })

export type BankInput = z.infer<typeof bankSchema>

/** The identity documents an artist may give instead of Aadhaar, all checked by hand */
export const OTHER_ID_KINDS = ['passport', 'voter-id', 'driving-licence'] as const
export type OtherIdKind = (typeof OTHER_ID_KINDS)[number]

/**
 * Identity: a PAN, with the name as printed on it, from every artist. Then, as two equal
 * choices: a masked e-Aadhaar with its last four digits (the full number is refused), or another
 * ID: a passport, voter ID or driving licence. Either shows an address; if it is not the address
 * given, a separate proof of address is needed.
 *
 * The masked e-Aadhaar's PDF password is optional and travels only with this request: it opens
 * the file in memory for the check (src/kyc/aadhaarCheck.ts) and is never stored or logged.
 *
 * No bank details: those are asked for only when a sale needs a payout (bankSchema).
 */
export const kycSchema = z
  .object({
    consent: z.literal(true, {
      error: 'We need your consent before we can take your identity details.',
    }),
    // How the consent was given: the privacy notice read to its end, then I AGREE typed out
    consentReadToEnd: z.literal(true, {
      error: 'Please read the privacy notice to the end, then confirm.',
    }),
    consentTyped: z.literal('I AGREE', {
      error: 'Please type I AGREE, in capitals, to confirm.',
    }),
    noticeVersion: z.string().max(40).optional(),
    pan: z.string({ error: 'Please give your PAN.' }).max(20, 'A PAN is ten characters.'),
    panName: z.string().max(120, 'Please keep this to 120 characters or fewer.').optional(),
    idChoice: z.enum(['aadhaar', 'other'], {
      error: 'Please choose a masked Aadhaar or another ID.',
    }),
    aadhaarLast4: z.string().max(20).optional(),
    aadhaarPassword: z.string().max(64).optional(),
    otherIdKind: z.enum(OTHER_ID_KINDS).optional(),
    addressOnIdMatches: z.boolean().optional(),
    documents: z
      .object({
        'pan-card': documentId,
        'masked-aadhaar': documentId,
        'other-id': documentId,
        'address-proof': documentId,
        'bank-proof': documentId,
        'identity-photo': documentId,
      })
      .default({}),
  })
  .superRefine(
    (value, ctx) => {
      // May run on a partly invalid value (see `when` below), so nothing here assumes a shape
      const documents = (value.documents ?? {}) as Partial<Record<KycDocumentKind, number>>
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path, message })

      const problem = panProblem(String(value.pan ?? ''))
      if (problem === 'format') {
        issue(['pan'], 'A PAN is ten characters: five letters, four digits, a letter.')
      } else if (problem === 'not-individual') {
        issue(['pan'], 'That looks like the PAN of a business. Please give your own, personal PAN.')
      }
      if (!String(value.panName ?? '').trim()) {
        issue(['panName'], 'Please give your name exactly as it is on your PAN card.')
      }

      if (value.idChoice === 'aadhaar') {
        const digits = String(value.aadhaarLast4 ?? '').trim()
        if (looksLikeFullAadhaar(digits)) {
          // Never accept, store or echo a full Aadhaar number
          issue(['aadhaarLast4'], 'Please give only the last four digits, not the whole number.')
        } else if (!isAadhaarLast4(digits)) {
          issue(['aadhaarLast4'], 'Please give the last four digits shown on your masked Aadhaar.')
        }
        if (!documents['masked-aadhaar']) {
          issue(['documents', 'masked-aadhaar'], 'Please upload your masked e-Aadhaar.')
        }
      }
      if (value.idChoice === 'other') {
        if (!value.otherIdKind) {
          issue(['otherIdKind'], 'Please choose which ID you are giving us.')
        }
        if (!documents['other-id']) {
          issue(['documents', 'other-id'], 'Please upload a copy of your ID.')
        }
      }

      if (!documents['pan-card']) {
        issue(
          ['documents', 'pan-card'],
          'Please add a photo of your PAN card, with your face on it clearly visible.',
        )
      }
      if (!documents['identity-photo']) {
        issue(
          ['documents', 'identity-photo'],
          'Please add the photo of you holding the paper with your code, name and date of birth.',
        )
      }

      if (typeof value.addressOnIdMatches !== 'boolean') {
        issue(['addressOnIdMatches'], 'Please tell us whether the address on it matches.')
      } else if (value.addressOnIdMatches === false && !documents['address-proof']) {
        issue(
          ['documents', 'address-proof'],
          'As the address differs, please upload a proof of your current address.',
        )
      }
    },
    { when: () => true },
  )
  .transform((value) => {
    const aadhaar = value.idChoice === 'aadhaar'
    const documents = { ...value.documents }
    // Only the documents of the choice made are kept with the record
    if (aadhaar) delete documents['other-id']
    else delete documents['masked-aadhaar']
    return {
      ...value,
      pan: normalisePan(value.pan),
      panName: value.panName?.trim() ?? '',
      aadhaarLast4: aadhaar ? value.aadhaarLast4?.trim() : undefined,
      aadhaarPassword: aadhaar ? value.aadhaarPassword || undefined : undefined,
      otherIdKind: aadhaar ? undefined : value.otherIdKind,
      documents,
    }
  })

export type KycInput = z.infer<typeof kycSchema>

/**
 * A partner's identity: the PAN, with the name as printed on it and a photo of the card, and the
 * same live photo as an artist's, holding a paper with a ten-minute code and their name. No second
 * ID, no address and no bank details: a partner is never paid by us, so only who they are is
 * checked. Consent is given the same way, the privacy notice read to its end and I AGREE typed.
 */
export const partnerKycSchema = z
  .object({
    consent: z.literal(true, {
      error: 'We need your consent before we can take your identity details.',
    }),
    consentReadToEnd: z.literal(true, {
      error: 'Please read the privacy notice to the end, then confirm.',
    }),
    consentTyped: z.literal('I AGREE', {
      error: 'Please type I AGREE, in capitals, to confirm.',
    }),
    noticeVersion: z.string().max(40).optional(),
    pan: z.string({ error: 'Please give your PAN.' }).max(20, 'A PAN is ten characters.'),
    panName: z.string().max(120, 'Please keep this to 120 characters or fewer.').optional(),
    documents: z.object({ 'pan-card': documentId, 'identity-photo': documentId }).default({}),
  })
  .superRefine(
    (value, ctx) => {
      const documents = (value.documents ?? {}) as Partial<Record<KycDocumentKind, number>>
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: 'custom', path, message })

      const problem = panProblem(String(value.pan ?? ''))
      if (problem === 'format') {
        issue(['pan'], 'A PAN is ten characters: five letters, four digits, a letter.')
      } else if (problem === 'not-individual') {
        issue(['pan'], 'That looks like the PAN of a business. Please give your own, personal PAN.')
      }
      if (!String(value.panName ?? '').trim()) {
        issue(['panName'], 'Please give your name exactly as it is on your PAN card.')
      }
      if (!documents['pan-card']) {
        issue(
          ['documents', 'pan-card'],
          'Please add a photo of your PAN card, with your face on it clearly visible.',
        )
      }
      if (!documents['identity-photo']) {
        issue(
          ['documents', 'identity-photo'],
          'Please add the photo of you holding the paper with your code and name.',
        )
      }
    },
    { when: () => true },
  )
  .transform((value) => ({
    ...value,
    pan: normalisePan(value.pan),
    panName: value.panName?.trim() ?? '',
  }))

export type PartnerKycInput = z.infer<typeof partnerKycSchema>
