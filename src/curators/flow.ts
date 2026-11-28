import 'server-only'

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Payload } from 'payload'

import { PART_BYTES, safeFileName, sniffFile } from '@/contact/rules'
import {
  deleteSealed,
  joinParts,
  newFolder,
  type Sealed,
  type StoredFile,
  storeFile,
  storePart,
} from '@/contact/store'
import { newApplicationReference } from '@/members/ids'
import { type ConsentEvidence, consentRow } from '@/members/consentRecord'
import type { Application } from '@/payload-types'

import type { CuratorInput } from './check'
import { notifyStaffOfCurator } from './emails'
import {
  CURATOR_ERRORS as E,
  CURATOR_NOTICE_VERSION,
  CV_MAX_BYTES,
  OPEN_STATUSES,
  PORTFOLIO_MAX_BYTES,
} from './rules'

/**
 * A guest curator's application from the form to the Curators screen.
 *
 * Every application has at least the CV to send, so it always arrives in three moves, as a contact
 * message with files does (src/contact/flow.ts). The answers come first: they are checked, kept
 * with the consent given, as a draft nobody is told of, with a one-off upload token (only its hash
 * is kept). The page then sends the portfolio PDF, if there is one, and the CV, in parts small
 * enough for one request; each part is sealed and stored as it arrives. When the last is in, the
 * files are joined, checked for what they really are, and stored sealed; the application becomes
 * New on the Curators screen, and business@ is told. A draft whose files never finish is never
 * shown, and is replaced if the same person sends the form again.
 *
 * One application per email address is open at a time (New, Talking or Working with us): the
 * unique "current slot" holds the address until the team answers "Not this time".
 */

export const UPLOAD_MINUTES = 30

type FileKind = 'portfolio' | 'cv'
type Progress = { kind: FileKind; name: string; size: number; received: number; parts: Sealed[] }

export class CuratorError extends Error {
  constructor(
    message: string,
    public status = 400,
    public errors?: Record<string, string>,
  ) {
    super(message)
    this.name = 'CuratorError'
  }
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export const curatorSlot = (email: string) => `curator:${email}`

const MAX_BYTES: Record<FileKind, number> = { portfolio: PORTFOLIO_MAX_BYTES, cv: CV_MAX_BYTES }
const partsMax = (kind: FileKind) => Math.ceil(MAX_BYTES[kind] / PART_BYTES)

/** What each file may really be: a portfolio is a PDF; a CV a PDF or a Word document */
const accepted = (kind: FileKind, head: Uint8Array, name: string) => {
  const found = sniffFile(head, name)
  if (!found) return null
  if (kind === 'portfolio') return found.ext === 'pdf' ? found : null
  return ['pdf', 'doc', 'docx'].includes(found.ext) ? found : null
}

const wrongType = (kind: FileKind) => (kind === 'portfolio' ? E.portfolioType : E.cvType)
const fieldOf = (kind: FileKind) => (kind === 'portfolio' ? 'portfolioFile' : 'cv')

/** An earlier, unfinished try from the same address: its parts go, and so does it */
const clearUnfinished = async (payload: Payload, application: Application) => {
  const files = (application.curatorUpload?.files ?? []) as Progress[]
  await deleteSealed(files.flatMap((f) => f.parts ?? []))
  await payload.delete({ collection: 'applications', id: application.id, overrideAccess: true })
}

/** Keeps the answers and the consent; the token the files travel with */
export const startCuratorApplication = async (
  payload: Payload,
  input: CuratorInput,
  evidence: ConsentEvidence,
): Promise<{ id: number; token: string; partBytes: number }> => {
  const { answers } = input
  const earlier = await payload.find({
    collection: 'applications',
    where: {
      and: [{ type: { equals: 'curator' } }, { 'curator.email': { equals: answers.email } }],
    },
    depth: 0,
    limit: 20,
    pagination: false,
    overrideAccess: true,
    showHiddenFields: true,
  })
  for (const application of earlier.docs) {
    if (application.stage === 'draft') await clearUnfinished(payload, application)
    else if (OPEN_STATUSES.includes(application.curatorStatus as never))
      throw new CuratorError(E.already, 409, { email: E.already })
  }

  const token = randomBytes(32).toString('base64url')
  const files: Progress[] = [
    ...(input.files.portfolio ? [{ kind: 'portfolio' as const, ...input.files.portfolio }] : []),
    { kind: 'cv' as const, ...input.files.cv },
  ].map((f) => ({ ...f, received: 0, parts: [] }))

  for (let attempt = 0; ; attempt++) {
    try {
      const created = await payload.create({
        collection: 'applications',
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: {
          reference: newApplicationReference('curator'),
          type: 'curator',
          stage: 'draft',
          currentSlot: curatorSlot(answers.email),
          curator: answers,
          curatorDeclarations: {
            consentProcessing: true,
            adult: true,
            accurate: true,
            keepOnFile: input.keepOnFile,
            privacyNoticeVersion: CURATOR_NOTICE_VERSION,
          },
          consentRecord: [consentRow(evidence, { checked: true, typed: null })],
          curatorUpload: {
            tokenHash: hash(token),
            expiresAt: new Date(Date.now() + UPLOAD_MINUTES * 60_000).toISOString(),
            folder: newFolder(),
            files,
          },
        } as never,
      })
      return { id: created.id, token, partBytes: PART_BYTES }
    } catch (error) {
      const message = String((error as Error)?.message)
      // The same address sent twice at once: the other request holds the slot
      if (/current_slot/i.test(message))
        throw new CuratorError(E.already, 409, { email: E.already })
      // A number already given: draw another
      if (!/reference/i.test(message) || attempt === 4) throw error
    }
  }
}

/** The draft still receiving its files, if the token is its own and has not lapsed */
const receiving = async (payload: Payload, id: number, token: string) => {
  if (!Number.isInteger(id) || id <= 0 || typeof token !== 'string' || token.length > 100)
    throw new CuratorError(E.ourSide, 404)
  const application = await payload
    .findByID({
      collection: 'applications',
      id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })
    .catch(() => null)
  const upload = application?.curatorUpload
  if (
    !application ||
    application.type !== 'curator' ||
    application.stage !== 'draft' ||
    !upload?.tokenHash ||
    !sameHash(upload.tokenHash, hash(token))
  )
    throw new CuratorError(E.ourSide, 404)
  if (!upload.expiresAt || new Date(upload.expiresAt).getTime() < Date.now())
    throw new CuratorError(E.failed, 410)
  return {
    application,
    folder: upload.folder ?? newFolder(),
    files: (upload.files ?? []) as Progress[],
  }
}

/**
 * One part of one file. Parts come in order, none larger than PART_BYTES, and never more than the
 * file's promised size; the first is checked for what the file really is, so a wrong file is
 * refused before the rest is sent.
 */
export const receiveCuratorPart = async (
  payload: Payload,
  { id, token, file, part }: { id: number; token: string; file: number; part: number },
  bytes: Buffer,
): Promise<void> => {
  const { application, folder, files } = await receiving(payload, id, token)
  const progress = files[file]
  if (!progress || part !== progress.parts.length || part >= partsMax(progress.kind))
    throw new CuratorError(E.ourSide, 409)
  if (
    bytes.length === 0 ||
    bytes.length > PART_BYTES ||
    progress.received + bytes.length > progress.size
  )
    throw new CuratorError(E.ourSide, 413)
  if (part === 0 && !accepted(progress.kind, bytes.subarray(0, 16), progress.name)) {
    const line = wrongType(progress.kind)
    throw new CuratorError(line, 415, { [fieldOf(progress.kind)]: line })
  }

  const sealed = await storePart(folder, bytes, 'curator')
  progress.parts.push(sealed)
  progress.received += bytes.length
  await payload.update({
    collection: 'applications',
    id: application.id,
    overrideAccess: true,
    context: { disableRevalidate: true },
    data: { curatorUpload: { ...application.curatorUpload, folder, files } } as never,
  })
}

/** Every part is in: join, check and keep each file, then show it to the team */
export const finishCuratorApplication = async (
  payload: Payload,
  { id, token }: { id: number; token: string },
): Promise<{ reference: string }> => {
  const { application, folder, files } = await receiving(payload, id, token)
  if (files.some((f) => f.received !== f.size)) throw new CuratorError(E.ourSide, 409)

  const stored: (StoredFile & { kind: FileKind })[] = []
  try {
    for (const [index, file] of files.entries()) {
      const bytes = await joinParts(file.parts)
      const kind = accepted(file.kind, bytes.subarray(0, 16), file.name)
      if (!kind || bytes.length !== file.size) {
        const line = wrongType(file.kind)
        throw new CuratorError(line, 415, { [fieldOf(file.kind)]: line })
      }
      const kept = await storeFile(
        folder,
        bytes,
        {
          filename: safeFileName(file.name, kind.ext, index),
          contentType: kind.type,
        },
        'curator',
      )
      stored.push({ ...kept, kind: file.kind })
    }
  } catch (error) {
    await deleteSealed(stored)
    throw error
  }

  await payload.update({
    collection: 'applications',
    id: application.id,
    overrideAccess: true,
    context: { disableRevalidate: true },
    data: {
      stage: 'submitted',
      submittedAt: new Date().toISOString(),
      curatorStatus: 'new',
      curatorFiles: stored,
      curatorUpload: { tokenHash: null, expiresAt: null, folder: null, files: null },
    } as never,
  })
  // The parts are no longer needed once the whole files are kept
  await deleteSealed(files.flatMap((f) => f.parts))

  const curator = application.curator!
  // The application is on the Curators screen whatever happens to this email, so a failure is
  // logged rather than undoing what the curator sent
  const told = await notifyStaffOfCurator(payload, {
    id: application.id,
    reference: application.reference,
    fullName: curator.fullName ?? '',
    email: curator.email ?? '',
    phone: curator.phone ?? '',
    city: curator.city ?? '',
    country: curator.country ?? '',
    role: curator.role ?? '',
    years: curator.years ?? '',
    areas: curator.areas ?? [],
    wants: curator.wants ?? '',
    portfolioLink: curator.portfolioLink,
    files: stored.map((f) => ({ kind: f.kind, filename: f.filename })),
    keepOnFile: Boolean(application.curatorDeclarations?.keepOnFile),
  })
  if (!told)
    payload.logger.error(
      `Staff were not emailed about curator application ${application.reference}`,
    )
  return { reference: application.reference }
}
