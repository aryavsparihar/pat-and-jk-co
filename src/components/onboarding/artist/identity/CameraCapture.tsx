'use client'

import React, { useEffect, useRef, useState } from 'react'

export type CameraProblem = 'declined' | 'unavailable'

/**
 * The camera, in the page: the front camera on phones and tablets. Shows a mirror image, as a
 * front camera does, and takes the photo the right way round, so the writing on the paper reads.
 * Works in Safari on iPad and iPhone (playsInline keeps the video in the page). The camera is on
 * only while this is open: closing it, or taking the photo, stops it.
 */
export const CameraCapture: React.FC<{
  onCapture: (photo: Blob) => void
  onProblem: (problem: CameraProblem) => void
  onClose: () => void
}> = ({ onCapture, onProblem, onClose }) => {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [still, setStill] = useState<{ blob: Blob; url: string } | null>(null)

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return onProblem('unavailable')
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } },
      })
      stream.current = media
      if (video.current) {
        video.current.srcObject = media
        await video.current.play().catch(() => undefined)
      }
      setReady(true)
    } catch (error) {
      const name = (error as Error)?.name
      onProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'declined' : 'unavailable')
    }
  }

  useEffect(() => {
    // Asks for the camera once the panel is on screen
    queueMicrotask(() => void start())
    return stop
    // Started once, when opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => void (still && URL.revokeObjectURL(still.url)), [still])

  const take = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stop()
        setStill({ blob, url: URL.createObjectURL(blob) })
      },
      'image/jpeg',
      0.9,
    )
  }

  const again = () => {
    setStill(null)
    setReady(false)
    void start()
  }

  return (
    <div className="mt-6 border border-border bg-surface p-4 sm:p-6">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden bg-[var(--text)] sm:aspect-[4/3]">
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element -- the photo just taken, shown locally
          <img alt="The photo you took" className="size-full object-cover" src={still.url} />
        ) : (
          <video
            aria-label="What the camera sees"
            autoPlay
            className="size-full -scale-x-100 object-cover"
            muted
            playsInline
            ref={video}
          />
        )}
        {!ready && !still && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-[var(--background)]">
            Opening the camera…
          </p>
        )}
      </div>
      <p aria-live="polite" className="muted mt-4 text-center text-base" role="status">
        {still
          ? 'Check that your face, the code, your name and your date of birth can all be read.'
          : ready
            ? 'Hold the paper beside your face, then take the photo.'
            : ''}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-x-8 gap-y-3">
        {still ? (
          <>
            <button
              className="btn btn-solid min-h-11"
              onClick={() => onCapture(still.blob)}
              type="button"
            >
              Use this photo
            </button>
            <button className="link link-caps min-h-11" onClick={again} type="button">
              Take it again
            </button>
          </>
        ) : (
          <button className="btn btn-solid min-h-11" disabled={!ready} onClick={take} type="button">
            Take the photo
          </button>
        )}
        <button
          className="link link-caps min-h-11"
          onClick={() => {
            stop()
            onClose()
          }}
          type="button"
        >
          Close the camera
        </button>
      </div>
    </div>
  )
}
