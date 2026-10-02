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

export const kycSchema = z
  .object({
    consent: z.literal(true, {
      error: 'We need your consent before we can take your identity and bank details.',
    }),
    idType: z.enum(['pan', 'aadhaar'], { error: 'Please choose PAN or Aadhaar.' }),
    pan: z.string().optional(),
    panName: z.string().optional(),
    aadhaarLast4: z.string().optional(),
    addressOnIdMatches: z.boolean({ error: 'Please tell us whether the address matches.' }),
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
      if (value.idType === 'pan') {
        const problem = panProblem(String(value.pan ?? ''))
        if (problem === 'format') {
          ctx.addIssue({
            code: 'custom',
            path: ['pan'],
            message: 'A PAN is ten characters: five letters, four digits, a letter.',
          })
        } else if (problem === 'not-individual') {
          ctx.addIssue({
            code: 'custom',
            path: ['pan'],
            message: 'That looks like the PAN of a business. Please give your own, personal PAN.',
          })
        }
        if (!String(value.panName ?? '').trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['panName'],
            message: 'Please give your name exactly as it is on your PAN card.',
          })
        }
      }
      if (value.idType === 'aadhaar') {
        const given = String(value.aadhaarLast4 ?? '')
        if (looksLikeFullAadhaar(given)) {
          // Never accept, store or echo a full Aadhaar number
          ctx.addIssue({
            code: 'custom',
            path: ['aadhaarLast4'],
            message: 'Please give only the last four digits, not the whole number.',
          })
        } else if (!isAadhaarLast4(given)) {
          ctx.addIssue({
            code: 'custom',
            path: ['aadhaarLast4'],
            message: 'Please give the last four digits of your Aadhaar.',
          })
        }
        if (!documents['masked-aadhaar']) {
          ctx.addIssue({
            code: 'custom',
            path: ['documents', 'masked-aadhaar'],
            message:
              'Please upload a masked Aadhaar: the version that shows only the last four digits.',
          })
        }
      }
      if (value.addressOnIdMatches === false && !documents['address-proof']) {
        ctx.addIssue({
          code: 'custom',
          path: ['documents', 'address-proof'],
          message: 'As the address differs, please upload a proof of your current address.',
        })
      }
    },
    { when: () => true },
  )
  .transform((value) => ({
    ...value,
    pan: value.idType === 'pan' ? normalisePan(value.pan ?? '') : undefined,
    panName: value.idType === 'pan' ? value.panName?.trim() : undefined,
    aadhaarLast4: value.idType === 'aadhaar' ? value.aadhaarLast4?.trim() : undefined,
  }))

export type KycInput = z.infer<typeof kycSchema>
