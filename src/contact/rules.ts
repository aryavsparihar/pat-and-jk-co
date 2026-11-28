/**
 * What the contact form accepts, and what it says when something is wrong: the founder's wording
 * (error messages, section 9). Used by the browser and the server alike.
 *
 * Files: up to three, 10 MB each, PDF, JPG, PNG or Word (the brief, sections 8 and 12). A
 * request to the site may carry at most 4.5 MB, so files travel in parts of PART_BYTES and are
 * put back together on the server.
 */

export const NAME_MAX = 120
export const MESSAGE_MAX = 5000
export const FILES_MAX = 3
export const FILE_MAX_BYTES = 10 * 1024 * 1024
export const PART_BYTES = 3 * 1024 * 1024
/** The parts a file of the largest size needs */
export const PARTS_MAX = Math.ceil(FILE_MAX_BYTES / PART_BYTES)

export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx'

export const CONTACT_ERRORS = {
  required: 'Please fill this in.',
  email: 'Please enter a full email address, for example name@example.com.',
  about: 'Please choose what you are writing about.',
  tooMany: 'You can attach up to three files.',
  failed: 'Your message could not be sent. Please try again in a minute.',
  ourSide: 'Something went wrong on our side. Please try again.',
  offline: 'We could not reach our server. Please check your connection and try again.',
} as const

/** "Please fill in “Message”." When the server finds a required field empty */
export const fillIn = (field: string) => `Please fill in “${field}”.`

export const wrongType = (name: string) => `“${name}” is not a PDF, JPG, PNG or Word file.`

export const tooLarge = (name: string) =>
  `“${name}” is larger than 10 MB. Please send a smaller copy.`

export const SENT_MESSAGE =
  'Thank you. Your message has reached us, and we will reply to the address you gave within two working days (IST).'

/** The kinds of file accepted, by name: what the browser can check before anything is sent */
export const allowedName = (name: string): boolean => /\.(pdf|jpe?g|png|docx?)$/i.test(name)

export type FileKind = { type: string; ext: string }

/**
 * What a file really is, from its first bytes, never from its name or the type the browser
 * claims. A .docx is a ZIP package, so it is taken as Word only when its name says so too.
 */
export const sniffFile = (head: Uint8Array, name: string): FileKind | null => {
  const at = (bytes: number[], offset = 0) => bytes.every((b, i) => head[offset + i] === b)
  if (at([0x25, 0x50, 0x44, 0x46, 0x2d])) return { type: 'application/pdf', ext: 'pdf' }
  if (at([0xff, 0xd8, 0xff])) return { type: 'image/jpeg', ext: 'jpg' }
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: 'image/png', ext: 'png' }
  // Word 97-2003: the compound file header
  if (at([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && /\.doc$/i.test(name))
    return { type: 'application/msword', ext: 'doc' }
  if (at([0x50, 0x4b, 0x03, 0x04]) && /\.docx$/i.test(name))
    return {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ext: 'docx',
    }
  return null
}

/** A file name safe to show and to save: no folders or control characters, the true extension */
export const safeFileName = (name: string, ext: string, index: number): string => {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>:|?*]+/g, '')
    .replace(/\.[^.]*$/, '')
    .trim()
    .slice(0, 80)
  return `${base || `attachment-${index + 1}`}.${ext}`
}

/** The file's name as the person chose it, without folders, for messages */
export const shownName = (name: string): string =>
  (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]+/g, '').slice(0, 120) || 'file'
