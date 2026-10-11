'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

/**
 * A look at a chosen document, made in the browser from the artist's own file: a photo shown from
 * a local object URL, a PDF's first page drawn by pdf.js. Nothing is fetched, and the file never
 * goes anywhere to be previewed. pdf.js is loaded only when a PDF is chosen, and runs on the
 * page itself (no worker file), so the member pages' security policy needs no change.
 */
export const FilePreview: React.FC<{ file: Blob | null; label: string; password?: string }> = ({
  file,
  label,
  password,
}) => {
  const isPdf = file?.type === 'application/pdf'
  const isImage = Boolean(file?.type.startsWith('image/'))
  const url = useMemo(() => (file && isImage ? URL.createObjectURL(file) : null), [file, isImage])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  const canvas = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<'drawing' | 'drawn' | 'locked' | 'failed'>('drawing')

  useEffect(() => {
    if (!file || !isPdf) return
    let cancelled = false
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
        // Defines globalThis.pdfjsWorker, which pdf.js uses to work on the page itself
        await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
        const task = pdfjs.getDocument({
          data: new Uint8Array(await file.arrayBuffer()),
          password: password || undefined,
        })
        const document = await task.promise
        const page = await document.getPage(1)
        const target = canvas.current
        if (cancelled || !target) return
        const base = page.getViewport({ scale: 1 })
        const scale = (Math.min(480, base.width) / base.width) * (window.devicePixelRatio || 1)
        const viewport = page.getViewport({ scale })
        target.width = Math.floor(viewport.width)
        target.height = Math.floor(viewport.height)
        await page.render({ canvas: target, viewport }).promise
        void task.destroy()
        if (!cancelled) setPdf('drawn')
      } catch (error) {
        if (!cancelled) setPdf((error as Error)?.name === 'PasswordException' ? 'locked' : 'failed')
      }
    })()
    return () => {
      cancelled = true
      setPdf('drawing')
    }
  }, [file, isPdf, password])

  if (!file) return null
  if (isImage && url) {
    return (
      <figure className="preview-in mt-4 w-full max-w-xs overflow-hidden border border-border bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- the artist's own file, shown locally */}
        <img alt={`Preview: ${label}`} className="max-h-72 w-full object-contain" src={url} />
      </figure>
    )
  }
  if (isPdf) {
    return (
      <figure className="preview-in mt-4 w-full max-w-xs border border-border bg-surface">
        <canvas
          aria-label={`Preview of the first page: ${label}`}
          className={pdf === 'drawn' ? 'block h-auto w-full' : 'hidden'}
          ref={canvas}
          role="img"
        />
        {pdf !== 'drawn' && (
          <p className="muted p-4 text-base">
            {pdf === 'drawing'
              ? 'Preparing a preview…'
              : pdf === 'locked'
                ? 'This PDF has a password, so it cannot be previewed until you type it below.'
                : 'This PDF cannot be previewed here, but it has been received.'}
          </p>
        )}
      </figure>
    )
  }
  return null
}
