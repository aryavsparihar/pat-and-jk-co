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
 * Application numbers exist from the first step and stay with the application for good: AA-7K3Q9
 * for an artist, PA-6SGRZ for a trade partner and CA-7KD2M for a guest curator (the founder's
 * designs, November 2026). Earlier ones (A-7K3Q9X, PT-7K3Q9X, and APP-7K3Q9X before October 2026)
 * stay as they were. They are random rather than sequential so they reveal nothing about how many
 * people have applied, and use an alphabet without the characters people misread or mistype
 * (0/O, 1/I/L, U/V).
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
/** Every kind of application: the two that lead to a member ID, and guest curators */
export type ApplicationKind = MemberKind | 'curator'

export const APPLICATION_REFERENCE_PREFIX: Record<ApplicationKind, string> = {
  artist: 'AA',
  partner: 'PA',
  curator: 'CA',
}
/** AA-, PA- or CA- and five characters; or the earlier A-, PT- or APP- and six */
export const APPLICATION_REFERENCE_PATTERN = new RegExp(
  `^((AA|PA|CA)-[${REFERENCE_ALPHABET}]{5}|(A|PT|APP)-[${REFERENCE_ALPHABET}]{6})$`,
)

/**
 * The code an artist writes by hand, with their name, and photographs themselves holding: proof
 * that a real person is applying and the photo is not an old one. "K7Q-4MX": six characters from
 * the unambiguous alphabet, split for reading aloud and writing.
 */
export const newIdentityCode = (): string => {
  const code = randomCode(6)
  return `${code.slice(0, 3)}-${code.slice(3)}`
}

/**
 * AA-7K3Q9, PA-6SGRZ or CA-7KD2M: 29^5, about 20 million of each kind. A clash is rare, and the
 * unique index refuses it, so the caller simply tries again
 */
export const newApplicationReference = (kind: ApplicationKind): string =>
  `${APPLICATION_REFERENCE_PREFIX[kind]}-${randomCode(5)}`

/**
 * A Help Center ticket: five characters from the unambiguous alphabet, like 7K3Q9 (29^5, about
 * 20 million). The caller checks it is unused (src/help/requests.ts).
 */
export const newHelpTicket = (): string => {
  // Always letters and numbers together (the founder, 15 November 2026): a code of letters alone,
  // like CHCWK, reads as a word, so draw again until it has at least one of each
  for (;;) {
    const code = randomCode(5)
    if (/\d/.test(code) && /[A-Z]/.test(code)) return code
  }
}

/** What a Help Center ticket looks like */
export const HELP_TICKET_PATTERN = new RegExp(`^[${REFERENCE_ALPHABET}]{5}$`)
