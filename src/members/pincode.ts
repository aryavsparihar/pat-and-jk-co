import { STATES_AND_TERRITORIES, type IndianState } from './forms/india'

/**
 * A PIN code to its town, district and state, from India Post's public directory
 * (api.postalpincode.in: no account, no key). A convenience only: the form fills the fields, and
 * the person can change any of them.
 */

export const isPinCode = (value: string): boolean => /^[1-9]\d{5}$/.test(value)

/** India Post's spellings, where they differ from our list */
const ALIASES: Record<string, IndianState> = {
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  chattisgarh: 'Chhattisgarh',
  uttaranchal: 'Uttarakhand',
  'new delhi': 'Delhi',
  'nct of delhi': 'Delhi',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
}

const tidy = (value: string) =>
  value.replace(/&/g, ' and ').replace(/\s+/g, ' ').trim().toLowerCase()

/** "Jammu & Kashmir" → "Jammu and Kashmir", as our dropdown has it; null if it is not one of ours */
export const stateFromIndiaPost = (value: string | null | undefined): IndianState | null => {
  if (!value) return null
  const key = tidy(value)
  return STATES_AND_TERRITORIES.find((s) => tidy(s) === key) ?? ALIASES[key] ?? null
}

type PostOffice = { Name?: string; Block?: string; District?: string; State?: string }

export type PinPlace = { city: string | null; district: string | null; state: IndianState | null }

/**
 * What a PIN code's post offices have in common. The district and state are the same for all of
 * them; the town is the block they share, or the one post office's name, or else the district.
 */
export const placeFromPostOffices = (offices: PostOffice[]): PinPlace | null => {
  const first = offices[0]
  if (!first?.District) return null
  const named = (v?: string) => (v && !/^(na|n\/a|-)$/i.test(v.trim()) ? v.trim() : null)
  const blocks = [...new Set(offices.map((o) => named(o.Block)).filter(Boolean))] as string[]
  const city =
    blocks.length === 1 ? blocks[0]! : offices.length === 1 ? (named(first.Name) ?? null) : null
  return {
    city: city ?? first.District.trim(),
    district: first.District.trim(),
    state: stateFromIndiaPost(first.State),
  }
}
