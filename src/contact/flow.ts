import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

import type { Enquiry } from '@/payload-types'

import { sendContactMessage } from './emails'
import type { ContactInput, PromisedFile } from './message'
import { CONTACT_ERRORS, PART_BYTES, PARTS_MAX, safeFileName, sniffFile, wrongType } from './rules'
import {
  deleteSealed,
  joinParts,
  newFolder,
  type Sealed,
  type StoredFile,
  storeFile,
  storePart,
} from './store'
import { topicFor } from './topics'

/**
 * A contact message from arrival to PJK's inbox.
 *
 * Without files it is stored and sent at once. With files it is stored as "receiving" with a
 * one-off upload token (only its hash is kept), and nobody is told yet. The page then sends each
 * file in parts of at most PART_BYTES, in order; each part is sealed and stored as it arrives.
 * When the last part is in, finish joins each file, checks what it really is, stores it sealed
 * as one file, deletes the parts, and sends the message. A message whose files never finish is
 * never sent; its token lapses after UPLOAD_MINUTES and the retention rules clear it away.
 */

export const UPLOAD_MINUTES = 30

type Progress = { name: string; size: number; received: number; parts: Sealed[] }

export class ContactError extends Error {
  constructor(
    message: string,
    public status = 400,
    public errors?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ContactError'
  }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

const send = async (payload: Payload, id: number, input: ContactInput, files: StoredFile[]) => {
  const topic = topicFor(input.topic)!
  return sendContactMessage(payload, topic.inbox, {
    id,
    name: input.name,
    email: input.email,
    topic: input.topic,
    message: input.message,
    files: files.map((f) => ({ filename: f.filename, size: f.size })),
  })
}

/** Stores the message. Sent now if it has no files; otherwise the token its files travel with */
export const startMessage = async (
  payload: Payload,
  input: ContactInput,
): Promise<{ sent: true } | { id: number; token: string; partBytes: number }> => {
  const topic = topicFor(input.topic)!
  const base = {
    name: input.name,
    email: input.email,
    topic: input.topic as Enquiry['topic'],
    inbox: topic.inbox,
    message: input.message,
  }
  if (input.files.length === 0) {
    const created = await payload.create({
      collection: 'enquiries',
      overrideAccess: true,
      data: { ...base, status: 'active' },
    })
    if (!(await send(payload, created.id, input, []))) {
      await payload.delete({ collection: 'enquiries', id: created.id, overrideAccess: true })
      throw new ContactError(CONTACT_ERRORS.failed, 503)
    }
    return { sent: true }
  }

  const token = randomBytes(32).toString('base64url')
  const files: Progress[] = input.files.map((f: PromisedFile) => ({
    name: f.name,
    size: f.size,
    received: 0,
    parts: [],
  }))
  const created = await payload.create({
    collection: 'enquiries',
    overrideAccess: true,
    data: {
      ...base,
      status: 'receiving',
      upload: {
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + UPLOAD_MINUTES * 60_000).toISOString(),
        folder: newFolder(),
        files,
      },
    },
  })
  return { id: created.id, token, partBytes: PART_BYTES }
}

/** The message still receiving its files, if the token is its own and has not lapsed */
const receiving = async (payload: Payload, id: number, token: string) => {
  if (!Number.isInteger(id) || id <= 0 || typeof token !== 'string' || token.length > 100)
    throw new ContactError(CONTACT_ERRORS.ourSide, 404)
  const enquiry = await payload
    .findByID({
      collection: 'enquiries',
      id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    .catch(() => null)
  const upload = enquiry?.upload
  if (
    !enquiry ||
    enquiry.status !== 'receiving' ||
    !upload?.tokenHash ||
    !sameHash(upload.tokenHash, hash(token))
  )
    throw new ContactError(CONTACT_ERRORS.ourSide, 404)
  if (!upload.expiresAt || new Date(upload.expiresAt).getTime() < Date.now())
    throw new ContactError(CONTACT_ERRORS.failed, 410)
  return {
    enquiry,
    folder: upload.folder ?? newFolder(),
    files: (upload.files ?? []) as Progress[],
  }
}

/**
 * One part of one file. Parts come in order, none larger than PART_BYTES, and never more than
 * the file's promised size; the first is checked for what the file really is, so a wrong file
 * is refused before the rest is sent.
 */
export const receivePart = async (
  payload: Payload,
  { id, token, file, part }: { id: number; token: string; file: number; part: number },
  bytes: Buffer,
): Promise<void> => {
  const { enquiry, folder, files } = await receiving(payload, id, token)
  const progress = files[file]
  if (!progress || part !== progress.parts.length || part >= PARTS_MAX)
    throw new ContactError(CONTACT_ERRORS.ourSide, 409)
  if (
    bytes.length === 0 ||
    bytes.length > PART_BYTES ||
    progress.received + bytes.length > progress.size
  )
    throw new ContactError(CONTACT_ERRORS.ourSide, 413)
  if (part === 0 && !sniffFile(bytes.subarray(0, 16), progress.name))
    throw new ContactError(wrongType(progress.name), 415, { files: wrongType(progress.name) })

  const sealed = await storePart(folder, bytes)
  progress.parts.push(sealed)
  progress.received += bytes.length
  await payload.update({
    collection: 'enquiries',
    id: enquiry.id,
    overrideAccess: true,
    data: { upload: { ...enquiry.upload, folder, files } } as never,
  })
}

/** Every part is in: join, check and store each file, then send the message */
export const finishMessage = async (
  payload: Payload,
  { id, token }: { id: number; token: string },
): Promise<void> => {
  const { enquiry, folder, files } = await receiving(payload, id, token)
  if (files.some((f) => f.received !== f.size)) throw new ContactError(CONTACT_ERRORS.ourSide, 409)

  const stored: StoredFile[] = []
  try {
    for (const [index, file] of files.entries()) {
      const bytes = await joinParts(file.parts)
      const kind = sniffFile(bytes.subarray(0, 16), file.name)
      if (!kind || bytes.length !== file.size)
        throw new ContactError(wrongType(file.name), 415, { files: wrongType(file.name) })
      stored.push(
        await storeFile(folder, bytes, {
          filename: safeFileName(file.name, kind.ext, index),
          contentType: kind.type,
        }),
      )
    }
  } catch (error) {
    await deleteSealed(stored)
    throw error
  }

  await payload.update({
    collection: 'enquiries',
    id: enquiry.id,
    overrideAccess: true,
    data: {
      status: 'active',
      attachments: stored,
      upload: { tokenHash: null, expiresAt: null, folder: null, files: null },
    } as never,
  })
  // The parts are no longer needed once the whole files are kept
  await deleteSealed(files.flatMap((f) => f.parts))

  const input: ContactInput = {
    name: enquiry.name,
    email: enquiry.email,
    topic: enquiry.topic,
    message: enquiry.message,
    files: [],
  }
  if (!(await send(payload, enquiry.id, input, stored))) {
    await deleteSealed(stored)
    await payload.delete({ collection: 'enquiries', id: enquiry.id, overrideAccess: true })
    throw new ContactError(CONTACT_ERRORS.failed, 503)
  }
}
