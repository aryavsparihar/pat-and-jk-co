import type { Access, CollectionConfig, Where } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'

import { isMember, isStaff } from '../access/roles'
import { publicError } from '../utilities/publicError'
import { portfolioFolder } from '../storage/memberMediaAdapter'

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
    // The server, after checking and cleaning the file; and staff, adding the pictures of a work
    // from the artist's Google Drive folder, whose uploads are cleaned the same way (below)
    create: ({ req: { user } }) => isStaff(user),
    read: readable,
    update: ({ req: { user } }) => isStaff(user),
    delete: ownOrStaff,
  },
  admin: {
    group: 'Members',
    hidden: ({ user }) => !isStaff(user),
    defaultColumns: ['filename', 'owner', 'createdAt'],
    description:
      'Pictures sent with artist applications, and approved artists’ portraits. Public only once staff approve the profile that uses them.',
  },
  fields: [
    {
      // Set only by the server when staff approve a portrait that uses this image, and cleared
      // when nothing approved uses it any more (src/members/profile.ts). It no longer makes
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
  hooks: {
    beforeOperation: [
      // A picture staff upload in the admin gets what an artist's gets: checked to be what it
      // says it is, re-encoded without location or camera details, at most 2400 px, under a name
      // that says nothing about the file it came from
      async ({ operation, req }) => {
        if (operation !== 'create' || !req.file || !isStaff(req.user)) return
        const { cleanImage, PortfolioError } = await import('../members/portfolio')
        const { randomBytes } = await import('node:crypto')
        let data: Buffer
        try {
          data = (await cleanImage(req.file.data)).data
        } catch (error) {
          if (error instanceof PortfolioError) throw publicError(error.message, 400)
          throw error
        }
        req.file.data = data
        req.file.size = data.length
        req.file.mimetype = 'image/jpeg'
        req.file.name = `work-${randomBytes(8).toString('hex')}.jpg`
      },
    ],
    beforeChange: [
      // Where a new upload's files go: this environment's folder of the private store. Set here,
      // not as the storage plugin's prefix option, whose default would make the column's default
      // (and so the schema) differ between a laptop, CI and production
      ({ data, req }) => {
        if (req.file) data.prefix = portfolioFolder()
        return data
      },
    ],
  },
  timestamps: true,
}
