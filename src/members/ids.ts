import { randomInt } from 'node:crypto'

/**
 * The two kinds of identifier a member meets.
 *
 * Member IDs (AT-X63G8, PT-8GH37) are issued on approval: the prefix for the kind and five random
 * characters, checked against every ID already given out (a deleted person keeps theirs), with
 * the column's unique index as the backstop. Random rather than counted, so an ID says nothing
 * about how many members there are. IDs issued before November 2026 (AT000001, from a Postgres
 * sequence per kind) stay as they were.
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

/** AT000001: the format used before November 2026. Kept for those IDs and for tests. */
export const formatMemberId = (kind: MemberKind, n: number | bigint): string => {
  const value = BigInt(n)
  if (value < 1n) throw new Error('Member numbers start at 1')
  return `${MEMBER_ID_PREFIX[kind]}${value.toString().padStart(6, '0')}`
}

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ'

/** AT-X63G8, or the older AT000001 */
export const MEMBER_ID_PATTERN = new RegExp(`^(AT|PT)(\\d{6,}|-[${REFERENCE_ALPHABET}]{5})$`)

const randomCode = (length: number): string => {
  let code = ''
  for (let i = 0; i < length; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]
  return code
}

/** AT-X63G8 or PT-8GH37: 29^5, about 20 million of each kind. The caller checks it is unused. */
export const newMemberId = (kind: MemberKind): string =>
  `${MEMBER_ID_PREFIX[kind]}-${randomCode(5)}`
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
  const code = randomCode(6)
  return `${code.slice(0, 3)}-${code.slice(3)}`
}

/** A-7K3Q9X or PT-7K3Q9X: 29^6, about 600 million each, so a clash is rare and simply retried */
export const newApplicationReference = (kind: MemberKind): string =>
  `${APPLICATION_REFERENCE_PREFIX[kind]}-${randomCode(6)}`

/**
 * A Help Center ticket: five characters from the unambiguous alphabet, like 7K3Q9 (29^5, about
 * 20 million). The caller checks it is unused (src/help/requests.ts).
 */
export const newHelpTicket = (): string => randomCode(5)

/** What a Help Center ticket looks like */
export const HELP_TICKET_PATTERN = new RegExp(`^[${REFERENCE_ALPHABET}]{5}$`)
