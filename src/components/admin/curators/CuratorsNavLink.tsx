import Link from 'next/link'
import React from 'react'

/** Adds "Guest curators" to the admin sidebar, beside the collections */
export const CuratorsNavLink: React.FC = () => (
  <Link
    className="nav__link"
    href="/admin/curators"
    style={{ marginTop: 'calc(var(--base) * 0.5)' }}
  >
    <span className="nav__link-label">Guest curators</span>
  </Link>
)

export default CuratorsNavLink
