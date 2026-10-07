import { randomInt } from 'node:crypto'

/**
 * The two kinds of identifier a member meets.
 *
 * Member IDs (AT000001, PT000001) are issued on approval from a Postgres sequence per kind, so
 * they are atomic under any amount of concurrency, never reused, and never worked out with
 * MAX()+1. A rejected application or a rolled-back approval may leave a gap; that is fine.
 *
 * Application references exist from the first step and stay with the person for good: A-7K3Q9X
 * for an artist, PT-7K3Q9X for a partner (APP-7K3Q9X before October 2026, kept as they were).
 * They are random rather than sequential so they reveal nothing about how many people have
 * applied, and use an alphabet without the characters people misread or mistype (0/O, 1/I/L, U/V).
 */

export type MemberKind = 'artist' | 'partner'

export const MEMBER_ID_PREFIX: Record<MemberKind, string> = { artist: 'AT', partner: 'PT' }

export const MEMBER_ID_SEQUENCE: Record<MemberKind, string> = {
  artist: 'member_id_artist_seq',
  partner: 'member_id_partner_seq',
}

/** AT000001. Six digits, growing to seven only after the millionth member of a kind. */
export const formatMemberId = (kind: MemberKind, n: number | bigint): string => {
  const value = BigInt(n)
  if (value < 1n) throw new Error('Member numbers start at 1')
  return `${MEMBER_ID_PREFIX[kind]}${value.toString().padStart(6, '0')}`
}

export const MEMBER_ID_PATTERN = /^(AT|PT)\d{6,}$/

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ'
export const APPLICATION_REFERENCE_PREFIX: Record<MemberKind, string> = {
  artist: 'A',
  partner: 'PT',
}
export const APPLICATION_REFERENCE_PATTERN = new RegExp(`^(A|PT|APP)-[${REFERENCE_ALPHABET}]{6}$`)

/**
 * The code an artist writes by hand, with their name, and photographs themselves holding: proof
 * that a real person is applying and the photo is not an old one. "K7Q-4MX": six characters from
 * the unambiguous alphabet, split for reading aloud and writing.
 */
export const newIdentityCode = (): string => {
  let code = ''
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  return `${code.slice(0, 3)}-${code.slice(3)}`
}

/** A-7K3Q9X or PT-7K3Q9X: 29^6, about 600 million each, so a clash is rare and simply retried */
export const newApplicationReference = (kind: MemberKind): string => {
  let code = ''
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  return `${APPLICATION_REFERENCE_PREFIX[kind]}-${code}`
}
