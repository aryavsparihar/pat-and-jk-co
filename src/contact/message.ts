import { isEmail, normaliseEmail } from '@/security/constants'

import {
  allowedName,
  CONTACT_ERRORS,
  FILE_MAX_BYTES,
  FILES_MAX,
  fillIn,
  MESSAGE_MAX,
  NAME_MAX,
  shownName,
  tooLarge,
  wrongType,
} from './rules'
import { topicFor } from './topics'

/**
 * A contact message as the page sends it, checked: the server's verdict, with the founder's
 * wording, field by field. The files are only promised here (name and size); their bytes follow
 * in parts, and are checked again for what they really are when they have all arrived.
 */

export type PromisedFile = { name: string; size: number }

export type ContactInput = {
  name: string
  email: string
  topic: string
  message: string
  files: PromisedFile[]
}

export type Checked =
  { ok: true; input: ContactInput } | { ok: false; errors: Record<string, string>; message: string }

const line = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : ''

/** The message keeps its line breaks; other control characters go */
const paragraphs = (value: unknown, max: number) =>
  typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, max)
    : ''

export const checkContact = (body: Record<string, unknown>): Checked => {
  const errors: Record<string, string> = {}

  const name = line(body.name, NAME_MAX)
  if (!name) errors.name = fillIn('Name')

  const rawEmail = line(body.email, 254)
  const email = normaliseEmail(rawEmail)
  if (!rawEmail) errors.email = fillIn('Email')
  else if (!isEmail(email)) errors.email = CONTACT_ERRORS.email

  const topic = topicFor(body.about)
  if (!topic) errors.about = CONTACT_ERRORS.about

  const message = paragraphs(body.message, MESSAGE_MAX)
  if (!message) errors.message = fillIn('Message')

  const files: PromisedFile[] = []
  const listed = Array.isArray(body.files) ? body.files : []
  if (listed.length > FILES_MAX) errors.files = CONTACT_ERRORS.tooMany
  else {
    for (const entry of listed) {
      const raw = (entry ?? {}) as Record<string, unknown>
      const fileName = shownName(String(raw.name ?? ''))
      const size = Number(raw.size)
      if (!allowedName(fileName)) {
        errors.files ??= wrongType(fileName)
        continue
      }
      if (!Number.isInteger(size) || size <= 0) {
        errors.files ??= wrongType(fileName)
        continue
      }
      if (size > FILE_MAX_BYTES) {
        errors.files ??= tooLarge(fileName)
        continue
      }
      files.push({ name: fileName, size })
    }
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors, message: Object.values(errors)[0]! }
  }
  return { ok: true, input: { name, email, topic: topic!.value, message, files } }
}
