import React from 'react'

/** The padlock beside "how your details are kept" */
export const Lock: React.FC = () => (
  <svg
    aria-hidden
    className="mt-1 size-6 shrink-0 text-primary"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    viewBox="0 0 24 24"
  >
    <rect height="10" rx="1.5" width="15" x="4.5" y="10.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.2" />
  </svg>
)
