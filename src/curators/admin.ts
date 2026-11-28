import 'server-only'

import type { Payload } from 'payload'

import { publicError } from '@/utilities/publicError'
import type { Application, User } from '@/payload-types'

import { type CuratorEmailKind, sendCuratorEmail } from './emails'
import type { CuratorStatus } from './rules'

/**
 * What the team does on the Curators screen (the founder's AdminCurators design): send one of the
 * two letters, as edited, which moves the status on; put a curator on a project; and add a note.
 * Staff only (the endpoints in src/collections/Applications.ts check), and each change is written
 * against the person who made it.
 */

const SUBJECT_MAX = 200
const BODY_MAX = 6000
const NOTE_MAX = 2000
const PROJECT_MAX = 120

const staffName = (user: Pick<User, 'email'> & { name?: string | null }) =>
  user.name?.trim() || user.email

const curatorById = async (payload: Payload, id: number): Promise<Application> => {
  const application = Number.isSafeInteger(id)
    ? await payload
        .findByID({ collection: 'applications', id, depth: 0, overrideAccess: true })
        .catch(() => null)
    : null
  if (!application || application.type !== 'curator' || application.stage === 'draft')
    throw publicError('That guest curator application was not found.', 404)
  return application
}

const save = (payload: Payload, id: number, user: User, data: Record<string, unknown>) =>
  payload.update({
    collection: 'applications',
    id,
    data: data as never,
    depth: 0,
    overrideAccess: true,
    context: {
      disableRevalidate: true,
      auditActor: { id: user.id, email: user.email, collection: 'users' },
    },
  })

/**
 * Sends a letter as the team edited it. "We would like to talk" moves a curator to Talking. "Not
 * this time" moves them to On file if they asked to be kept, otherwise to Not this time, frees
 * their address for a later application, and starts the 90 days before it is deleted.
 */
export const sendFromCuratorsScreen = async (
  payload: Payload,
  user: User,
  {
    id,
    kind,
    subject,
    body,
  }: { id: number; kind: CuratorEmailKind; subject: string; body: string },
): Promise<Application> => {
  if (kind !== 'talk' && kind !== 'decline') throw publicError('Choose which email to send.', 400)
  const cleanSubject = String(subject ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SUBJECT_MAX)
  const cleanBody = String(body ?? '')
    .trim()
    .slice(0, BODY_MAX)
  if (!cleanSubject || !cleanBody)
    throw publicError('The email needs a subject and a message.', 400)

  const application = await curatorById(payload, id)
  const curator = application.curator
  if (!curator?.email) throw publicError('This application has no email address.', 409)
  const keepOnFile = Boolean(application.curatorDeclarations?.keepOnFile)

  const sent = await sendCuratorEmail(
    payload,
    {
      id: application.id,
      reference: application.reference,
      fullName: curator.fullName ?? '',
      email: curator.email,
      keepOnFile,
    },
    { subject: cleanSubject, body: cleanBody },
  )
  if (!sent) throw publicError('The email could not be sent. Please try again.', 503)

  const now = new Date().toISOString()
  const status: CuratorStatus =
    kind === 'talk' ? 'talking' : keepOnFile ? 'on-file' : 'not-this-time'
  return save(payload, application.id, user, {
    curatorStatus: status,
    curatorEmails: [
      ...(application.curatorEmails ?? []),
      { kind, subject: cleanSubject, body: cleanBody, by: staffName(user), at: now },
    ],
    ...(kind === 'decline' ? { currentSlot: null, decidedAt: now, decidedBy: user.id } : {}),
  })
}

/** Puts a curator on a project, which makes them Working with us; empty takes them off it */
export const setCuratorProject = async (
  payload: Payload,
  user: User,
  { id, project }: { id: number; project: string },
): Promise<Application> => {
  const application = await curatorById(payload, id)
  const name = String(project ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PROJECT_MAX)
  return save(payload, application.id, user, {
    curatorProject: name || null,
    ...(name ? { curatorStatus: 'working' } : {}),
  })
}

/** A note for the team, kept with who wrote it and when; never shown to the curator */
export const addCuratorNote = async (
  payload: Payload,
  user: User,
  { id, note }: { id: number; note: string },
): Promise<Application> => {
  const application = await curatorById(payload, id)
  const text = String(note ?? '')
    .trim()
    .slice(0, NOTE_MAX)
  if (!text) throw publicError('Write the note first.', 400)
  return save(payload, application.id, user, {
    teamNotes: [
      ...(application.teamNotes ?? []),
      { note: text, by: staffName(user), at: new Date().toISOString() },
    ],
  })
}

/** The portfolio PDF or the CV, opened for staff */
export const curatorFile = async (payload: Payload, id: number, kind: string) => {
  const application = await curatorById(payload, id)
  const withKeys = await payload.findByID({
    collection: 'applications',
    id: application.id,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  const file = (withKeys.curatorFiles ?? []).find((f) => f.kind === kind)
  if (!file) throw publicError('That file was not found.', 404)
  const { openSealed } = await import('@/contact/store')
  return { file, bytes: new Uint8Array(await openSealed(file as never)) }
}
