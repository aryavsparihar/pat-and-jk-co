'use client'

import { cn } from '@/utilities/ui'
import React, { useEffect, useRef, useState } from 'react'

import { FOUNDER_NAME } from './founder'
import { SIGNATURE_INK, SIGNATURE_STROKES, SIGNATURE_VIEWBOX } from './signatureStrokes'

type Props = {
  /** Drawn stroke by stroke when it comes into view, and again on a click (Home); or shown whole */
  animated?: boolean
  className?: string
}

/**
 * The founder's signature, from signature-animation.html, used as given: the strokes in his
 * order, starting once the block is 40 % in view, replaying on a click or a key, and finished at
 * once for anyone who has turned off motion (globals.css). The Journal shows it whole.
 */
export const FounderSignature: React.FC<Props> = ({ animated = false, className }) => {
  const box = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  // A new key draws a fresh copy, which starts the animation from the beginning
  const [round, setRound] = useState(0)

  useEffect(() => {
    const el = box.current
    if (!animated || !el) return
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPlaying(true)
          seen.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [animated])

  const drawing = (
    <svg
      aria-label={`Signature of ${FOUNDER_NAME}`}
      className={cn(
        'block h-auto w-full overflow-visible',
        animated ? cn('signature', playing && 'signature-go') : 'signature-still',
      )}
      key={round}
      role="img"
      viewBox={SIGNATURE_VIEWBOX}
    >
      {SIGNATURE_STROKES.map(([d, seconds, after, width]) => (
        <path
          d={d}
          fill="none"
          key={d}
          pathLength={1}
          stroke={SIGNATURE_INK}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={width}
          style={
            animated ? { animationDuration: `${seconds}s`, animationDelay: `${after}s` } : undefined
          }
        />
      ))}
    </svg>
  )

  if (!animated) return <div className={className}>{drawing}</div>

  return (
    <div className={className} ref={box}>
      <button
        aria-label="Watch the signature drawn again"
        className="block w-full cursor-pointer text-left"
        onClick={() => {
          setPlaying(true)
          setRound((n) => n + 1)
        }}
        title="Click to watch it signed again"
        type="button"
      >
        {drawing}
      </button>
    </div>
  )
}
