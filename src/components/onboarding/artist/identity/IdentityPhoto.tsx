'use client'

import React, { useState } from 'react'

import { api } from '../../api'
import { Sending } from '../../Sending'
import { useStepUp } from '../../StepUp'
import { CameraCapture, type CameraProblem } from './CameraCapture'
import { FilePreview } from './FilePreview'
import { type Code, codeLeft, IdentityCode } from './IdentityCode'
import { shrink } from './Upload'

/**
 * The photo of the applicant holding a paper with a ten-minute code and their name (and, for an
 * artist, their date of birth): a code is asked for, then the photo is taken here or uploaded,
 * and sent straight to the server, encrypted there. The name is written on the paper, so when it
 * changes the form clears the photo by giving this a new key, and a new one must be taken
 * (photoAfterNameChange).
 */
export const IdentityPhoto: React.FC<{
  /** Whose application: the server checks the code against it */
  type: 'artist' | 'partner'
  /** The name as on their PAN, as typed now */
  name: string
  /** The photo was received: its document, and the name written on its paper */
  onSent: (documentId: number, name: string) => void
  /** Said when it first appears: why an earlier photo was cleared */
  note?: string | null
  error?: string
}> = ({ type, name: typed, onSent, note = null, error }) => {
  const name = typed.trim()
  const [code, setCode] = useState<Code | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)
  const [camera, setCamera] = useState(false)
  const [cameraProblem, setCameraProblem] = useState<CameraProblem | null>(null)
  // The photo, shown from this page's own copy
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoNote, setPhotoNote] = useState<string | null>(note)
  const { guard } = useStepUp()

  const newCode = async () => {
    setCodeBusy(true)
    const result = await guard(() =>
      api<Omit<Code, 'gotAt'>>('/next/members/kyc/identity-code', { body: { type } }),
    )
    setCodeBusy(false)
    if (!result.ok)
      return setPhotoNote(result.data.message ?? 'A code could not be given just now.')
    // The ten minutes run from now, on this device's clock: see codeLeft
    setCode({ code: result.data.code, minutes: result.data.minutes, gotAt: Date.now() })
    setPhotoNote(null)
  }

  const sendPhoto = async (blob: Blob, capturedWith: 'camera' | 'upload') => {
    setCamera(false)
    if (!code || codeLeft(code) <= 0) {
      return setPhotoNote(
        'Your code ran out before the photo was taken. Please get a new code and take it again.',
      )
    }
    setPhoto(blob)
    setPhotoBusy(true)
    setPhotoNote(null)
    const body = await shrink(blob)
    const form = new FormData()
    form.append('kind', 'identity-photo')
    form.append('type', type)
    form.append('file', body, 'identity-photo.jpg')
    form.append('identityCode', code.code)
    form.append('panName', name)
    form.append('capturedWith', capturedWith)
    const result = await guard(() =>
      api<{ document: { id: number }; codeProblem?: string }>('/next/members/kyc/document', {
        body: form,
      }),
    )
    setPhotoBusy(false)
    if (!result.ok) {
      setPhoto(null)
      return setPhotoNote(result.data.message ?? 'The photo could not be sent.')
    }
    onSent(result.data.document.id, name)
    setPhotoNote('Received, and encrypted.')
  }

  return (
    <>
      {!name ? (
        <p className="muted measure text-base">
          First, give your name as it is on your PAN, above. It is what you will write on the paper.
        </p>
      ) : (
        <>
          <IdentityCode busy={codeBusy} code={code} onNew={() => void newCode()}>
            {!camera && (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                {cameraProblem === null && (
                  <button
                    className="btn btn-solid min-h-11"
                    disabled={photoBusy}
                    onClick={() => setCamera(true)}
                    type="button"
                  >
                    Take a photo now
                  </button>
                )}
                <label
                  className={`min-h-11 cursor-pointer ${cameraProblem === null ? 'link link-caps inline-flex items-center' : 'btn btn-solid'}`}
                  htmlFor="identity-photo-file"
                >
                  {cameraProblem === null ? 'Upload a photo instead' : 'Upload the photo'}
                </label>
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={photoBusy}
                  id="identity-photo-file"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void sendPhoto(file, 'upload')
                  }}
                  type="file"
                />
              </div>
            )}
          </IdentityCode>
          {cameraProblem && (
            <p className="measure text-base" role="status">
              {cameraProblem === 'declined'
                ? 'The camera was not allowed, which is fine. Take the photo with your camera app and upload it here instead.'
                : 'We could not open a camera on this device. Take the photo another way and upload it here instead.'}
            </p>
          )}
          {camera && (
            <CameraCapture
              onCapture={(blob) => void sendPhoto(blob, 'camera')}
              onClose={() => setCamera(false)}
              onProblem={(problem) => {
                setCamera(false)
                setCameraProblem(problem)
              }}
            />
          )}
        </>
      )}

      <FilePreview file={photo} label="the photo of you" />
      <p aria-live="polite" className="text-base" role="status">
        {photoBusy ? <Sending /> : photoNote}
      </p>
      {error && (
        <p className="text-base italic text-destructive" id="field-documents-identity-photo-error">
          {error}
        </p>
      )}
    </>
  )
}

/** What the form says when a new name clears the photo taken for the old one */
export const NAME_CHANGED =
  'Your name has changed, so we have cleared the photo and its code. Please get a new code and take the photo again.'
