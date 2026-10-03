'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useEffect, useState } from 'react'

import { api } from './api'

export type Picture = { id: number; thumbnail: string | null }

/**
 * The member's pictures, and a way to send more: straight to Blob storage in production, as a
 * form upload locally. Each is checked and cleaned on the server and comes back as a thumbnail.
 */
export const usePictures = () => {
  const [pictures, setPictures] = useState<Record<number, Picture>>({})
  const [mode, setMode] = useState<'blob' | 'direct'>('direct')
  const [prefix, setPrefix] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void api<{ mode: 'blob' | 'direct'; uploadPrefix: string; images: Picture[] }>(
      '/next/members/portfolio',
    ).then((r) => {
      if (!current || !r.ok) return
      setMode(r.data.mode)
      setPrefix(r.data.uploadPrefix)
      setPictures(Object.fromEntries(r.data.images.map((i) => [i.id, i])))
    })
    return () => {
      current = false
    }
  }, [])

  const sendOne = useCallback(
    async (file: File): Promise<Picture | null> => {
      let result
      if (mode === 'blob') {
        const blob = await upload(`${prefix}${file.name.replace(/[^\w.-]/g, '_')}`, file, {
          access: 'public',
          handleUploadUrl: '/next/members/portfolio/upload-token',
          contentType: file.type,
        })
        result = await api<{ image: Picture }>('/next/members/portfolio', {
          body: { blobUrl: blob.url },
        })
      } else {
        const form = new FormData()
        form.append('file', file)
        result = await api<{ image: Picture }>('/next/members/portfolio', { body: form })
      }
      if (!result.ok) {
        setProblem(`${file.name}: ${result.data.message ?? 'That picture could not be added.'}`)
        return null
      }
      return result.data.image
    },
    [mode, prefix],
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
      return added
    },
    [sendOne],
  )

  return { pictures, send, busy, problem }
}
