import type { Access, CollectionConfig } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

import { isMember, isStaff } from '../access/roles'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Staff see every image; a member sees only their own; the public sees none. */
const ownOrStaff: Access = ({ req: { user } }) => {
  if (isStaff(user)) return true
  if (isMember(user)) return { owner: { equals: user.id } }
  return false
}

/**
 * Pictures of their work that artists send with an application (3 to 10 each).
 *
 * Nothing reaches this collection as the visitor sent it. The upload endpoint
 * (src/app/(frontend)/next/members/portfolio) reads the file, checks what it really is from its
 * bytes rather than its name, re-encodes it (which drops EXIF, including any GPS position), caps
 * its size, and only then stores it here; Payload makes the web-sized copies.
 *
 * Not public: unlike site media, these are served only through Payload's file route, which applies
 * the read rule above. Locally they live outside public/ for the same reason.
 */
export const PortfolioImages: CollectionConfig = {
  slug: 'portfolio-images',
  labels: { singular: 'Portfolio image', plural: 'Portfolio images' },
  access: {
    create: () => false, // only the server, after checking and cleaning the file
    read: ownOrStaff,
    update: ({ req: { user } }) => isStaff(user),
    delete: ownOrStaff,
  },
  admin: {
    group: 'Members',
    hidden: ({ user }) => !isStaff(user),
    defaultColumns: ['filename', 'owner', 'createdAt'],
    description: 'Pictures sent with artist applications. Not public.',
  },
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      // A description for screen readers once the work is shown anywhere
      name: 'alt',
      type: 'text',
      maxLength: 200,
    },
  ],
  upload: {
    staticDir: path.resolve(dirname, '../../.uploads/portfolio-images'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    adminThumbnail: 'thumbnail',
    imageSizes: [
      { name: 'thumbnail', width: 400 },
      { name: 'display', width: 1600 },
    ],
  },
  timestamps: true,
}
