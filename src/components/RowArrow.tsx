import React from 'react'

/**
 * A hairline arrow, the same weight as the rules it sits between, for rows that are links
 * (`.row-link`). The right padding is the room it travels on hover, so it lands flush with the
 * rule instead of crossing it.
 */
export const RowArrow: React.FC = () => (
  <svg
    aria-hidden
    className="row-arrow w-[1.9rem] shrink-0 pr-[0.3rem]"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    viewBox="0 0 26 8"
  >
    <path d="M0 4h23.5M20 1l3.5 3-3.5 3" />
  </svg>
)
