import type { Access, CollectionConfig } from 'payload'

import { isStaff } from '../access/roles'
import { publishedFields, reviewGroup } from '../members/reviewFields'

export const ARTWORK_AVAILABILITY = [
  { label: 'Available', value: 'available' },
  { label: 'Reserved', value: 'reserved' },
  { label: 'Sold', value: 'sold' },
  { label: 'Not available', value: 'not-available' },
] as const

const staffOnly: Access = ({ req: { user } }) => isStaff(user)

/**
 * An approved artist's works, shown through Phulhaar once staff approve them.
 *
 * Members never write here through Payload's API: their portal endpoints
 * (src/app/(frontend)/next/members/portal) check ownership and write with the Local API. What
 * they change is the working copy; the public reads only `published`, the snapshot staff approved
 * (src/members/artworks.ts). Archiving hides a work at once and needs no review.
 */
export const Artworks: CollectionConfig = {
  slug: 'artworks',
  labels: { singular: 'Artwork', plural: 'Artworks' },
  graphQL: false,
  access: {
    create: staffOnly,
    read: staffOnly,
    update: staffOnly,
    delete: staffOnly,
    admin: ({ req: { user } }) => isStaff(user),
  },
  admin: {
    group: 'Members',
    useAsTitle: 'title',
    defaultColumns: ['title', 'owner', 'review.state', 'availability', 'archived', 'updatedAt'],
    hidden: ({ user }) => !isStaff(user),
    description:
      'Works approved artists add from their account. New and edited works wait for review: approve them from the sidebar to make them public.',
  },
  defaultSort: '-updatedAt',
  fields: [
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'members',
      required: true,
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      // Shown through Phulhaar; a relationship so other ventures could show works later
      name: 'venture',
      type: 'relationship',
      relationTo: 'ventures',
      admin: { position: 'sidebar' },
    },
    {
      name: 'reviewActions',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '@/components/admin/ReviewPanel#ReviewPanel' },
      },
    },
    reviewGroup('review', 'Review'),
    { name: 'title', type: 'text', required: true, maxLength: 160 },
    {
      type: 'row',
      fields: [
        { name: 'year', type: 'number', min: 1900, max: 2100, admin: { width: '25%' } },
        { name: 'medium', type: 'text', maxLength: 120, admin: { width: '40%' } },
        {
          name: 'surface',
          type: 'text',
          maxLength: 120,
          admin: { width: '35%', description: 'Canvas, paper, wood panel…' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'widthCm', label: 'Width (cm)', type: 'number', min: 0, admin: { width: '33%' } },
        { name: 'heightCm', label: 'Height (cm)', type: 'number', min: 0, admin: { width: '33%' } },
        { name: 'depthCm', label: 'Depth (cm)', type: 'number', min: 0, admin: { width: '33%' } },
      ],
    },
    {
      name: 'edition',
      type: 'text',
      maxLength: 60,
      admin: { description: '"Unique", or e.g. "3 of 10".' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'forSale',
          label: 'For sale',
          type: 'checkbox',
          defaultValue: true,
          admin: { width: '33%' },
        },
        {
          name: 'priceInr',
          label: 'Price (₹)',
          type: 'number',
          min: 0,
          admin: { width: '33%', condition: (data) => data?.forSale !== false },
        },
        {
          name: 'availability',
          type: 'select',
          defaultValue: 'available',
          options: ARTWORK_AVAILABILITY.map(({ label, value }) => ({ label, value })),
          admin: { width: '34%' },
        },
      ],
    },
    { name: 'description', type: 'textarea', maxLength: 2000 },
    {
      name: 'images',
      type: 'relationship',
      relationTo: 'portfolio-images',
      hasMany: true,
      maxRows: 8,
      admin: { description: 'The first is the one shown in lists.' },
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'archived',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Archived works are never shown.' },
    },
    ...publishedFields('published'),
  ],
  endpoints: [
    {
      // POST /api/{collection}/:id/review  { decision: 'approve' | 'request-changes', note }. Staff only
      path: '/:id/review',
      method: 'post',
      handler: async (req) => {
        if (!isStaff(req.user)) return Response.json({ message: 'Not allowed.' }, { status: 403 })
        const body = (await req.json?.().catch(() => ({}))) as { decision?: string; note?: string }
        if (body?.decision !== 'approve' && body?.decision !== 'request-changes') {
          return Response.json({ message: 'Approve, or ask for changes?' }, { status: 400 })
        }
        const { PortalError, decideArtwork } = await import('../members/artworks')
        try {
          await decideArtwork(req.payload, {
            id: Number(req.routeParams?.id),
            decision: body.decision,
            note: body.note,
            actor: req.user,
          })
          return Response.json({ ok: true })
        } catch (error) {
          if (error instanceof PortalError)
            return Response.json({ message: error.message }, { status: error.status })
          req.payload.logger.error({ err: error, msg: 'Review decision failed' })
          return Response.json({ message: 'The decision could not be saved.' }, { status: 500 })
        }
      },
    },
  ],
  timestamps: true,
}
