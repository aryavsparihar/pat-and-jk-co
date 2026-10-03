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

const text = (max: number, message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .max(max, `Please keep this under ${max} characters.`)

export const KYC_DOCUMENT_KINDS = [
  'pan-card',
  'masked-aadhaar',
  'other-id',
  'address-proof',
  'bank-proof',
] as const
export type KycDocumentKind = (typeof KYC_DOCUMENT_KINDS)[number]

const documentId = z.coerce.number().int().positive().optional()

export const bankSchema = z
  .object({
    holderName: text(120, 'Please give the name on the account, as the bank has it.'),
    accountNumber: z
      .string({ error: 'Please give your account number.' })
      .transform(normaliseAccount)
      .refine(isAccountNumber, 'An account number is 9 to 18 digits.'),
    accountNumberConfirm: z
      .string({ error: 'Please type your account number again.' })
      .transform(normaliseAccount),
    ifsc: z
      .string({ error: 'Please give the IFSC.' })
      .transform(normaliseIfsc)
      .refine(
        isIfsc,
        'An IFSC has 11 characters: four letters, a zero, then six letters or digits.',
      ),
    bankName: text(120, 'Please give the name of the bank.'),
    branchName: text(120, 'Please give the branch.'),
    accountType: z.enum(['savings', 'current'], { error: 'Please choose savings or current.' }),
  })
  .superRefine(
    (value, ctx) => {
      if (value.accountNumber !== value.accountNumberConfirm) {
        ctx.addIssue({
          code: 'custom',
          path: ['accountNumberConfirm'],
          message: 'The two account numbers do not match. Please type it again.',
        })
      }
    },
    // Run even when another field is wrong, so every problem is listed at once
    { when: () => true },
  )

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
 */
export const kycSchema = z
  .object({
    consent: z.literal(true, {
      error: 'We need your consent before we can take your identity and bank details.',
    }),
    pan: z.string({ error: 'Please give your PAN.' }),
    panName: z.string().optional(),
    idChoice: z.enum(['aadhaar', 'other'], {
      error: 'Please choose a masked Aadhaar or another ID.',
    }),
    aadhaarLast4: z.string().optional(),
    aadhaarPassword: z.string().max(64).optional(),
    otherIdKind: z.enum(OTHER_ID_KINDS).optional(),
    addressOnIdMatches: z.boolean().optional(),
    bank: bankSchema,
    documents: z
      .object({
        'pan-card': documentId,
        'masked-aadhaar': documentId,
        'other-id': documentId,
        'address-proof': documentId,
        'bank-proof': documentId,
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
