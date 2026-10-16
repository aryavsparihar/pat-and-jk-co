import type { Access, CollectionConfig, Where } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

import { isMember, isStaff } from '../access/roles'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/** Staff and the owner can change or remove an image; nobody else. */
const ownOrStaff: Access = ({ req: { user } }) => {
  if (isStaff(user)) return true
  if (isMember(user)) return { owner: { equals: user.id } }
  return false
}

/**
 * Staff see every image and a member sees their own; nobody else, approved or not. Pictures for the
 * public are copied out to public storage when a work is published, so the originals never need to
 * be readable by anyone else.
 */
const readable: Access = ({ req: { user } }): boolean | Where => {
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
 * Private: kept in the private store, never the public one (src/storage/memberMediaAdapter.ts),
 * and served only through Payload's file route, which applies the read rule above, or through the
 * portal's signed links (src/members/mediaLinks.ts). Never through a public URL, the image
 * optimiser or the CDN.
 */
export const PortfolioImages: CollectionConfig = {
  slug: 'portfolio-images',
  labels: { singular: 'Portfolio image', plural: 'Portfolio images' },
  access: {
    create: () => false, // only the server, after checking and cleaning the file
    read: readable,
    update: ({ req: { user } }) => isStaff(user),
    delete: ownOrStaff,
  },
  admin: {
    group: 'Members',
    hidden: ({ user }) => !isStaff(user),
    defaultColumns: ['filename', 'owner', 'createdAt'],
    description:
      'Pictures sent with artist applications, and approved artists’ works. Public only once staff approve the work or portrait that uses them.',
  },
  fields: [
    {
      // Set only by the server when staff approve a work or a portrait that uses this image, and
      // cleared when nothing approved uses it any more (src/members/artworks.ts). It no longer makes
      // the picture readable by anyone: publishing copies public versions out instead
      name: 'public',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
      // Shown to staff and the owner only: a public picture does not name the member behind it.
      // Without a document (when Payload checks a query) the rule stands aside, as filtering by
      // owner is what lets a member see their own
      access: {
        read: ({ req: { user }, doc }) =>
          !doc ||
          isStaff(user) ||
          (isMember(user) &&
            (typeof doc.owner === 'object' ? doc.owner?.id : doc.owner) === user.id),
      },
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
    // Only where pictures from before were kept locally; new ones go to the private store
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
