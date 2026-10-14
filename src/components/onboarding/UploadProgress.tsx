'use client'

import React from 'react'

import { cn } from '@/utilities/ui'

import type { PictureProgress } from './sendPicture'

export type UploadState =
  PictureProgress | { phase: 'waiting' } | { phase: 'done' } | { phase: 'failed' }

/**
 * The bar under a picture on its way. A number only while one can be measured: the transfer
 * itself. Otherwise (starting, or the server preparing the picture) a band moves along the bar
 * and the words say what is happening, without a made-up percentage. Screen readers hear a
 * progress bar with a value only when there is one.
 */
export const UploadProgress: React.FC<{ name: string; state: UploadState; className?: string }> = ({
  name,
  state,
  className,
}) => {
  const fraction =
    state.phase === 'sending' && state.fraction !== null
      ? state.fraction
      : state.phase === 'done'
        ? 1
        : null
  const moving =
    (state.phase === 'sending' && state.fraction === null) || state.phase === 'preparing'
  const words =
    state.phase === 'waiting'
      ? 'Waiting its turn'
      : state.phase === 'sending'
        ? state.fraction === null
          ? 'Starting to send'
          : `Sending, ${Math.round(state.fraction * 100)}%`
        : state.phase === 'preparing'
          ? 'Preparing your picture'
          : state.phase === 'done'
            ? 'Added'
            : 'Not added'

  return (
    <div className={className}>
      <div
        aria-label={`${words}: ${name}`}
        aria-valuemax={fraction === null ? undefined : 100}
        aria-valuemin={fraction === null ? undefined : 0}
        aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
        aria-valuetext={words}
        className="relative h-1 w-full max-w-sm overflow-hidden bg-border"
        role="progressbar"
      >
        {moving ? (
          <div className="upload-bar-moving absolute inset-y-0 w-1/3 bg-primary" />
        ) : (
          <div
            className={cn(
              'upload-bar h-full origin-left bg-primary',
              state.phase === 'failed' && 'bg-destructive',
            )}
            style={{ transform: `scaleX(${state.phase === 'failed' ? 1 : (fraction ?? 0)})` }}
          />
        )}
      </div>
      <p className="muted mt-2 text-base">{words}</p>
    </div>
  )
}
