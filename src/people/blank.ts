import type { Field } from 'payload'

/**
 * Every value a list of fields can hold, emptied: what erasing someone writes over their record.
 * It walks the collection's own field configuration, so a field added later is erased as well
 * unless it is named in `keep`. `keep` applies at the level it is given for; inside a group that
 * is erased, everything goes.
 */
export const blankOf = (
  fields: Field[],
  keep: ReadonlySet<string> = new Set(),
): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        if ('name' in tab && tab.name) {
          if (!keep.has(tab.name)) out[tab.name] = blankOf(tab.fields)
        } else Object.assign(out, blankOf(tab.fields, keep))
      }
      continue
    }
    // Rows, collapsibles and unnamed groups only arrange fields: theirs belong to this level
    if (!('name' in field) || !field.name) {
      if ('fields' in field && field.fields) Object.assign(out, blankOf(field.fields, keep))
      continue
    }
    if (keep.has(field.name)) continue
    switch (field.type) {
      case 'ui':
      case 'join':
        continue
      case 'group':
        out[field.name] = blankOf(field.fields)
        break
      case 'array':
      case 'blocks':
        out[field.name] = []
        break
      case 'relationship':
      case 'upload':
      case 'select':
        out[field.name] = field.hasMany ? [] : null
        break
      case 'checkbox':
        out[field.name] = false
        break
      default:
        out[field.name] = null
    }
  }
  return out
}
