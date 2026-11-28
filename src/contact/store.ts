import 'server-only'

import { randomBytes } from 'node:crypto'

import { newDataKey, openFile, sealFile, unwrapDataKey, wrapDataKey } from '@/kyc/crypto'
import { deleteEncrypted, kycPrefix, readEncrypted, storeEncrypted } from '@/kyc/documentStore'

/**
 * The files sent with a contact message or a guest curator's application, kept the way Help
 * Center files and KYC documents are:
 * each encrypted with a key of its own, that key wrapped with the master key, and the ciphertext
 * in the private store, in this environment's folder. Nothing there has a public URL; staff open
 * a file through the message's own route in the admin, which decrypts it for them.
 *
 * A file arrives in parts (a request may carry at most 4.5 MB). Each part is sealed and stored
 * as it comes; when the last has arrived they are opened, joined, checked, and sealed again as
 * one file, and the parts are deleted.
 */

export type Sealed = { storageKey: string; keyId: string; wrappedKey: string }

export type StoredFile = Sealed & { filename: string; contentType: string; size: number }

/** Where a file belongs: a contact message's, or a curator application's */
export type FileArea = 'contact' | 'curator'

/** What each key is bound to, so a key unwrapped for one file can open no other */
const context = (storageName: string) =>
  storageName.startsWith('curator/')
    ? `curator-file:${storageName}`
    : `contact-attachment:${storageName}`

const seal = async (folder: string, bytes: Buffer, area: FileArea): Promise<Sealed> => {
  const storageName = `${area}/${folder}/${randomBytes(16).toString('hex')}.enc`
  const key = newDataKey()
  const wrapped = wrapDataKey(key, context(storageName))
  const storageKey = await storeEncrypted(storageName, sealFile(key, bytes, context(storageName)))
  return { storageKey, ...wrapped }
}

export const openSealed = async (sealed: Sealed): Promise<Buffer> => {
  const storageName = sealed.storageKey.slice(kycPrefix().length)
  const key = unwrapDataKey(
    { keyId: sealed.keyId, wrappedKey: sealed.wrappedKey },
    context(storageName),
  )
  return openFile(key, await readEncrypted(sealed.storageKey), context(storageName))
}

export const deleteSealed = async (files: Pick<Sealed, 'storageKey'>[]) => {
  await Promise.all(files.map((f) => deleteEncrypted(f.storageKey).catch(() => undefined)))
}

/** A folder of its own for each message or application, so its files sit together */
export const newFolder = () => randomBytes(8).toString('hex')

/** One part of a file, sealed and stored */
export const storePart = (folder: string, bytes: Buffer, area: FileArea = 'contact') =>
  seal(folder, bytes, area)

/** The parts, opened and joined in order */
export const joinParts = async (parts: Sealed[]): Promise<Buffer> =>
  Buffer.concat(await Promise.all(parts.map(openSealed)))

/** The whole file, sealed and stored */
export const storeFile = async (
  folder: string,
  bytes: Buffer,
  meta: { filename: string; contentType: string },
  area: FileArea = 'contact',
): Promise<StoredFile> => ({ ...(await seal(folder, bytes, area)), ...meta, size: bytes.length })
