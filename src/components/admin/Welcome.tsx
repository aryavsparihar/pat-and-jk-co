import type { ServerProps } from 'payload'
import React from 'react'

const links = [
  {
    href: '/admin/collections/pages',
    title: 'Pages',
    text: 'Edit any page. Add, remove or reorder its blocks.',
  },
  {
    href: '/admin/collections/posts',
    title: 'Journal',
    text: 'Write news, announcements and stories.',
  },
  {
    href: '/admin/collections/ventures',
    title: 'Ventures',
    text: 'The businesses in the group and their status.',
  },
  {
    href: '/admin/collections/form-submissions',
    title: 'Enquiries',
    text: 'Messages sent through the contact and collaborate forms.',
  },
  {
    href: '/admin/collections/site-settings',
    title: 'Site settings',
    text: 'Logo, colours, navigation, footer and contact details.',
  },
  {
    href: '/admin/collections/media',
    title: 'Media library',
    text: 'Upload photographs, logos and documents.',
  },
]

/** Dashboard welcome panel with shortcuts to the things editors do most. */
const Welcome: React.FC<ServerProps> = ({ user }) => {
  const name = (user as { name?: string } | undefined)?.name?.split(' ')[0]

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 2)' }}>
      <h2 style={{ marginBottom: 'calc(var(--base) * 0.5)' }}>
        {name ? `Welcome back, ${name}.` : 'Welcome.'}
      </h2>
      <p style={{ marginBottom: 'calc(var(--base) * 1.5)', opacity: 0.75, maxWidth: 640 }}>
        Everything on the website is managed here. Changes you publish go live within seconds. Use
        the <strong>Brand</strong> selector in the sidebar to switch between brands.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 'calc(var(--base) * 0.75)',
        }}
      >
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            style={{
              display: 'block',
              padding: 'calc(var(--base) * 0.9)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 4,
              textDecoration: 'none',
              color: 'inherit',
              background: 'var(--theme-elevation-0)',
            }}
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>{link.title} →</strong>
            <span style={{ opacity: 0.7, fontSize: 13 }}>{link.text}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default Welcome
