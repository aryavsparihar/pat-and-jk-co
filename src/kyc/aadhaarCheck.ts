import 'server-only'

import { webcrypto } from 'node:crypto'

import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'

import { CCA_ROOTS_PEM } from './ccaRoots'

/**
 * Checks a masked e-Aadhaar the way a careful reviewer would, and says what it found. Advisory by
 * default (src/kyc/settings.ts): the result is recorded for staff and never stops an application.
 *
 *   1. the original PDF from myAadhaar, not a photo or a scan
 *   2. UIDAI's digital signature: valid, covering the whole file (nothing changed since signing),
 *      made by UIDAI, and chaining to one of India's CCA root certificates
 *   3. with the PDF's password, held in memory only: the copy is masked (no full number appears),
 *      its last four digits are the ones typed, the name is the name on the PAN, and the date of
 *      birth is the one given in "About you"
 *
 * The signature is over the file's raw bytes, so step 2 needs no password. Nothing read from the
 * file is kept beyond the result: the text, the photo and the password are gone when this returns.
 * Messages name what went wrong, never a value from the file.
 */

export type AadhaarCheckResult = 'verified' | 'not-verified' | 'manual-review'

export type AadhaarCheck = {
  result: AadhaarCheckResult
  /** Plain sentences for staff, one per problem; none when verified */
  reasons: string[]
  /** The signer's name and the signing date, when a signature was read */
  signer?: string
  signedOn?: string
  /** True when the file shows a full Aadhaar number: it must not be kept */
  unmasked?: boolean
}

pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto: webcrypto as never }))

const UIDAI = /unique identification authority of india/i
const SIGNING_TIME = '1.2.840.113549.1.9.5'

const toArrayBuffer = (b: Buffer): ArrayBuffer =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

const commonName = (cert: pkijs.Certificate, which: 'subject' | 'issuer'): string =>
  String(cert[which].typesAndValues.find((t) => t.type === '2.5.4.3')?.value.valueBlock.value ?? '')

const pemToCertificate = (pem: string): pkijs.Certificate => {
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
  return pkijs.Certificate.fromBER(toArrayBuffer(der))
}

/**
 * A date of birth as YYYY-MM-DD, read in India. Payload stores dates as timestamps: midnight in
 * India is the evening before in UTC, so cutting the ISO string would give the wrong day.
 */
export const indianDate = (value: string | Date | null | undefined): string | null => {
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date)
}

/** Words of a name, for comparing names written differently (case, dots, extra spaces) */
const nameWords = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)

type Signature = {
  signer?: string
  signedOn?: string
  problems: string[]
  soft: string[]
}

/** Step 2: the signature, from the raw bytes */
const checkSignature = async (file: Buffer, roots: string[]): Promise<Signature> => {
  const out: Signature = { problems: [], soft: [] }
  const raw = file.toString('latin1')
  const ranges = [...raw.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].map(
    (m) => m.slice(1, 5).map(Number) as [number, number, number, number],
  )
  if (ranges.length === 0) {
    out.problems.push(
      'The PDF has no digital signature, so it is not the original download from myAadhaar.',
    )
    return out
  }
  // The signature that matters is the one covering the end of the file
  const [a, b, c, d] = ranges[ranges.length - 1]!
  if (a !== 0 || c + d !== file.length) {
    out.problems.push('The PDF was changed after UIDAI signed it.')
  }

  let signed: pkijs.SignedData
  try {
    const hex = file
      .subarray(a + b, c)
      .toString('latin1')
      .replace(/[<>\s]/g, '')
    const der = Buffer.from(hex, 'hex')
    const asn = asn1js.fromBER(toArrayBuffer(der))
    signed = new pkijs.SignedData({ schema: new pkijs.ContentInfo({ schema: asn.result }).content })
  } catch {
    out.problems.push('The digital signature could not be read.')
    return out
  }

  const data = Buffer.concat([file.subarray(a, a + b), file.subarray(c, c + d)])
  let signerCert: pkijs.Certificate | undefined
  try {
    const verdict = await signed.verify({
      signer: 0,
      data: toArrayBuffer(data),
      extendedMode: true,
      checkChain: false,
    })
    signerCert = verdict.signerCertificate ?? undefined
    if (!verdict.signatureVerified) out.problems.push('UIDAI’s signature does not match the file.')
  } catch {
    out.problems.push('UIDAI’s signature does not match the file.')
  }

  const time = signed.signerInfos[0]?.signedAttrs?.attributes.find((x) => x.type === SIGNING_TIME)
  const signedAt: Date | undefined = time?.values[0]?.toDate?.()
  if (signedAt) out.signedOn = signedAt.toISOString().slice(0, 10)

  if (signerCert) {
    out.signer = commonName(signerCert, 'subject')
    if (!UIDAI.test(out.signer)) out.problems.push('The PDF was not signed by UIDAI.')

    if (roots.length === 0) {
      out.soft.push(
        'India’s CCA root certificates are not installed, so the chain was not checked.',
      )
    } else {
      try {
        const engine = new pkijs.CertificateChainValidationEngine({
          certs: [...(signed.certificates ?? []).filter((x) => x instanceof pkijs.Certificate)],
          trustedCerts: roots.map(pemToCertificate),
          // The certificates were valid when UIDAI signed, even if some have expired since
          checkDate: signedAt ?? new Date(),
        })
        engine.certs.unshift(signerCert)
        const chain = await engine.verify()
        if (!chain.result) {
          out.problems.push('The signing certificate does not chain to India’s CCA roots.')
        }
      } catch {
        out.problems.push('The signing certificate does not chain to India’s CCA roots.')
      }
    }
  } else if (!out.problems.length) {
    out.problems.push('The digital signature could not be read.')
  }
  return out
}

/**
 * pdf.js refuses to run if anything has added an enumerable property to Array.prototype, which
 * breaks `for...in` over arrays. drizzle-kit (loaded by Payload's database adapter for schema
 * push) adds `random` that way. The property is kept, only made non-enumerable, as it should
 * have been; drizzle-kit still calls it, and pdf.js is satisfied.
 */
const hideEnumerableArrayExtensions = () => {
  for (const name of Object.keys(Array.prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, name)
    if (descriptor?.enumerable) {
      Object.defineProperty(Array.prototype, name, { ...descriptor, enumerable: false })
    }
  }
}

/** Step 3: the text, with the password, in memory only */
const readText = async (file: Buffer, password: string): Promise<string | 'bad-password'> => {
  hideEnumerableArrayExtensions()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: new Uint8Array(file),
    password,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  })
  try {
    const doc = await task.promise
    let text = ''
    for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
      const content = await (await doc.getPage(p)).getTextContent()
      text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
    }
    return text.replace(/\s+/g, ' ')
  } catch (error) {
    if ((error as { name?: string })?.name === 'PasswordException') return 'bad-password'
    throw error
  } finally {
    await task.destroy()
  }
}

export const checkMaskedAadhaar = async ({
  file,
  password,
  last4,
  panName,
  dateOfBirth,
  roots = CCA_ROOTS_PEM,
}: {
  file: Buffer
  password?: string
  last4?: string
  panName?: string
  /** YYYY-MM-DD, from "About you" */
  dateOfBirth?: string | null
  roots?: string[]
}): Promise<AadhaarCheck> => {
  if (file.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return {
      result: 'manual-review',
      reasons: ['A photo or scan, not the original PDF from myAadhaar. Please check it by hand.'],
    }
  }

  const signature = await checkSignature(file, roots)
  const problems = [...signature.problems]
  const soft = [...signature.soft]
  const base = { signer: signature.signer, signedOn: signature.signedOn }

  if (!password) {
    soft.push('No password was given, so the details inside could not be read.')
  } else {
    let text: string | 'bad-password'
    try {
      text = await readText(file, password)
    } catch {
      text = ''
    }
    if (text === 'bad-password') {
      soft.push('The password given does not open the PDF, so the details could not be read.')
    } else if (text.replace(/\s/g, '').length < 40) {
      soft.push('The PDF has no readable text, so the details could not be read.')
    } else {
      // A full 12-digit number, not part of a longer one (the 16-digit VID)
      if (/(?<![\dXx] ?)\b\d{4} ?\d{4} ?\d{4}\b(?! ?\d)/.test(text)) {
        return {
          ...base,
          result: 'not-verified',
          unmasked: true,
          reasons: [
            'The PDF shows a full Aadhaar number: it is not the masked copy, so it was not kept.',
          ],
        }
      }
      const masked = text.match(/[Xx]{4} ?[Xx]{4} ?(\d{4})/)
      if (!masked) problems.push('No masked Aadhaar number (XXXX XXXX 1234) was found.')
      else if (last4 && masked[1] !== last4.trim()) {
        problems.push('The last four digits in the PDF are not the ones typed.')
      }

      if (panName) {
        const wanted = nameWords(panName)
        const present = new Set(nameWords(text))
        const found = wanted.filter((w) => present.has(w)).length
        if (found === 0) problems.push('The name in the PDF is not the name on the PAN.')
        else if (found < wanted.length) {
          soft.push('The name in the PDF only partly matches the name on the PAN.')
        }
      }

      const born = indianDate(dateOfBirth)
      if (born) {
        const full = text.match(
          /(?:DOB|Date of Birth|D\.O\.B\.?)\s*[:/]?\s*(\d{2})[/-](\d{2})[/-](\d{4})/i,
        )
        const year = text.match(/(?:Year of Birth|YOB)\s*[:/]?\s*(\d{4})/i)
        if (full) {
          if (`${full[3]}-${full[2]}-${full[1]}` !== born) {
            problems.push('The date of birth in the PDF is not the one in “About you”.')
          }
        } else if (year) {
          if (year[1] !== born.slice(0, 4)) {
            problems.push('The year of birth in the PDF is not the one in “About you”.')
          } else soft.push('The PDF shows only a year of birth; the year matches.')
        } else {
          soft.push('No date of birth was found in the PDF.')
        }
      }
    }
  }

  if (problems.length) return { ...base, result: 'not-verified', reasons: [...problems, ...soft] }
  if (soft.length) return { ...base, result: 'manual-review', reasons: soft }
  return { ...base, result: 'verified', reasons: [] }
}
