'use client'

import { useCallback, useEffect, useState } from 'react'

import { api } from './api'
import { sendPicture } from './sendPicture'
import type { UploadState } from './UploadProgress'

export type Picture = { id: number; thumbnail: string | null }

/**
 * The member's pictures, and a way to send more: straight to Blob storage in production, as a
 * form upload locally. Each is checked and cleaned on the server and comes back as a thumbnail.
 * `uploading` says where the picture being sent has got to, for an UploadProgress bar.
 */
export const usePictures = () => {
  const [pictures, setPictures] = useState<Record<number, Picture>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [uploading, setUploading] = useState<{ name: string; state: UploadState } | null>(null)

  useEffect(() => {
    let current = true
    void api<{ images: Picture[] }>('/next/members/portfolio').then((r) => {
      if (!current || !r.ok) return
      setPictures(Object.fromEntries(r.data.images.map((i) => [i.id, i])))
    })
    return () => {
      current = false
    }
  }, [])

  const sendOne = useCallback(
    async (file: File): Promise<Picture | null> => {
      const result = await sendPicture<{ image: Picture }>(file, (state) =>
        setUploading({ name: file.name, state }),
      )
      if (!result.ok) {
        setProblem(`${file.name}: ${result.data.message ?? 'That picture could not be added.'}`)
        return null
      }
      return result.data.image
    },
    [],
  )

  /** Sends each file in turn; returns the pictures that arrived */
  const send = useCallback(
    async (files: FileList | File[] | null, max = Infinity): Promise<Picture[]> => {
      if (!files) return []
      setProblem(null)
      const added: Picture[] = []
      for (const file of Array.from(files).slice(0, max)) {
        setBusy(`Adding ${file.name}…`)
        try {
          const picture = await sendOne(file)
          if (picture) {
            added.push(picture)
            setPictures((all) => ({ ...all, [picture.id]: picture }))
          }
        } catch {
          setProblem(`${file.name}: that picture could not be sent. Please try again.`)
        }
      }
      setBusy(null)
      setUploading(null)
      return added
    },
    [sendOne],
  )

  return { pictures, send, busy, problem, uploading }
}
