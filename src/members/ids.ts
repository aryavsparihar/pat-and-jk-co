import { randomInt } from 'node:crypto'

/**
 * The two kinds of identifier a member meets.
 *
 * Member IDs (AT000001, PT000001) are issued on approval from a Postgres sequence per kind, so
 * they are atomic under any amount of concurrency, never reused, and never worked out with
 * MAX()+1. A rejected application or a rolled-back approval may leave a gap; that is fine.
 *
 * Application references (APP-7K3Q9X) exist from the first step, are random rather than
 * sequential so they reveal nothing about how many people have applied, and use an alphabet
 * without the characters people misread or mistype (0/O, 1/I/L, U/V).
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
export const APPLICATION_REFERENCE_PATTERN = new RegExp(`^APP-[${REFERENCE_ALPHABET}]{6}$`)

/** APP-7K3Q9X: 29^6, about 600 million, so a clash is rare and simply retried */
export const newApplicationReference = (): string => {
  let code = ''
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  return `APP-${code}`
}
