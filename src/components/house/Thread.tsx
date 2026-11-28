import React from 'react'

/** The garland thread between sections of the house pages: line, bead, ring, bead, line */
export const Thread: React.FC = () => (
  <div aria-hidden className="thread">
    <span className="thread-line" />
    <span className="thread-bead" />
    <span className="thread-ring" />
    <span className="thread-bead" />
    <span className="thread-line" />
  </div>
)
