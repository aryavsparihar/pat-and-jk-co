import React from 'react'

/**
 * "Sending" and three dots that rise and fall one after another, for a button at work. A screen
 * reader hears "Sending…" once; the dots are decoration and stay still under reduced motion.
 */
export const Sending: React.FC<{ label?: string }> = ({ label = 'Sending' }) => (
  <span className="inline-flex items-baseline">
    {label}
    <span aria-hidden className="sending-dots ml-0.5 inline-flex">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
    <span className="sr-only">…</span>
  </span>
)
