import React from 'react'
import Link from 'next/link'

/** Adds "How to use this panel" to the admin sidebar. */
export const GuideNavLink: React.FC = () => (
  <Link className="nav__link" href="/admin/guide" style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
    <span className="nav__link-label">How to use this panel</span>
  </Link>
)

export default GuideNavLink
