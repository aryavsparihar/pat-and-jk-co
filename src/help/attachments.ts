import 'server-only'

import { randomBytes } from 'node:crypto'

import { newDataKey, openFile, sealFile, unwrapDataKey, wrapDataKey } from '@/kyc/crypto'
import { deleteEncrypted, kycPrefix, readEncrypted, storeEncrypted } from '@/kyc/documentStore'

import type { Attachment } from './request'

/**
 * The files sent with a Help Center request, kept so staff can open them from the ticket in the
 * admin (the founder asked for this on 22 November 2026; until then they lived only in the email).
 *
 * They are kept the way KYC documents are: each file encrypted with a key of its own, that key
 * wrapped with the master key, and the ciphertext in the private store under help/, in this
 * environment's folder. Nothing in the store has a public URL; staff open a file through the
 * ticket's own route, which decrypts it for them.
 */

export type StoredAttachment = {
  filename: string
  contentType: string
  size: number
  storageKey: string
  keyId: string
  wrappedKey: string
}

const context = (storageName: string) => `help-attachment:${storageName}`

/** Encrypts and stores each file. A file that fails is undone with the rest, and the error thrown */
export const storeHelpAttachments = async (
  attachments: Attachment[],
): Promise<StoredAttachment[]> => {
  const stored: StoredAttachment[] = []
  const folder = randomBytes(8).toString('hex')
  try {
    for (const file of attachments) {
      const storageName = `help/${folder}/${randomBytes(16).toString('hex')}.enc`
      const key = newDataKey()
      const wrapped = wrapDataKey(key, context(storageName))
      const storageKey = await storeEncrypted(
        storageName,
        sealFile(key, file.content, context(storageName)),
      )
      stored.push({
        filename: file.filename,
        contentType: file.contentType,
        size: file.content.length,
        storageKey,
        ...wrapped,
      })
    }
    return stored
  } catch (error) {
    await deleteHelpAttachments(stored)
    throw error
  }
}

/** The decrypted file */
export const openHelpAttachment = async (file: StoredAttachment): Promise<Buffer> => {
  const storageName = file.storageKey.slice(kycPrefix().length)
  const key = unwrapDataKey(
    { keyId: file.keyId, wrappedKey: file.wrappedKey },
    context(storageName),
  )
  return openFile(key, await readEncrypted(file.storageKey), context(storageName))
}

export const deleteHelpAttachments = async (files: Pick<StoredAttachment, 'storageKey'>[]) => {
  await Promise.all(files.map((f) => deleteEncrypted(f.storageKey).catch(() => undefined)))
}
