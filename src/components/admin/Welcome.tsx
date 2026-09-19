import type { ServerProps } from 'payload'
import Link from 'next/link'
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
    text: 'The ventures under PJK and their status.',
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
  {
    href: '/admin/collections/people',
    title: 'People',
    text: 'Names, roles, portraits and captions on the leadership page.',
  },
  {
    href: '/admin/guide',
    title: 'How to use this panel',
    text: 'A short guide: editing pages, publishing, photographs, enquiries.',
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
        Everything on the website is edited here, and anything you publish is live within seconds —
        no code changes, no waiting. Work is saved as a draft until you press{' '}
        <strong>Publish</strong>, every published version is kept, and the <strong>Brand</strong>{' '}
        selector in the sidebar switches between brands. New here? Start with{' '}
        <Link href="/admin/guide">how to use this panel</Link>.
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
