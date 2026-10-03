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

/**
 * Identity: a PAN, with the name as printed on it, from every artist. Aadhaar is optional and only
 * ever as a masked copy (for the address) with its last four digits; the full number is refused.
 * The two Aadhaar parts come together or not at all. If the masked Aadhaar shows an address other
 * than the one given, a separate proof of address is needed.
 */
export const kycSchema = z
  .object({
    consent: z.literal(true, {
      error: 'We need your consent before we can take your identity and bank details.',
    }),
    pan: z.string({ error: 'Please give your PAN.' }),
    panName: z.string().optional(),
    aadhaarLast4: z.string().optional(),
    // Asked only when a masked Aadhaar is given: does it show the address we were given?
    addressOnIdMatches: z.boolean().optional(),
    bank: bankSchema,
    documents: z
      .object({
        'pan-card': documentId,
        'masked-aadhaar': documentId,
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

      const digits = String(value.aadhaarLast4 ?? '').trim()
      const maskedCopy = Boolean(documents['masked-aadhaar'])
      if (looksLikeFullAadhaar(digits)) {
        // Never accept, store or echo a full Aadhaar number
        issue(['aadhaarLast4'], 'Please give only the last four digits, not the whole number.')
      } else if (digits && !isAadhaarLast4(digits)) {
        issue(['aadhaarLast4'], 'Please give the last four digits of your Aadhaar.')
      } else if (maskedCopy && !digits) {
        issue(['aadhaarLast4'], 'Please add the last four digits shown on your masked Aadhaar.')
      }
      if (digits && !maskedCopy) {
        issue(
          ['documents', 'masked-aadhaar'],
          'Please upload the masked Aadhaar as well, or leave the Aadhaar digits empty.',
        )
      }
      if (maskedCopy && typeof value.addressOnIdMatches !== 'boolean') {
        issue(['addressOnIdMatches'], 'Please tell us whether the address on it matches.')
      }
      if (maskedCopy && value.addressOnIdMatches === false && !documents['address-proof']) {
        issue(
          ['documents', 'address-proof'],
          'As the address differs, please upload a proof of your current address.',
        )
      }
    },
    { when: () => true },
  )
  .transform((value) => {
    const aadhaarLast4 = value.aadhaarLast4?.trim() || undefined
    return {
      ...value,
      pan: normalisePan(value.pan),
      panName: value.panName?.trim() ?? '',
      aadhaarLast4,
      addressOnIdMatches: aadhaarLast4 ? value.addressOnIdMatches : undefined,
    }
  })

export type KycInput = z.infer<typeof kycSchema>
