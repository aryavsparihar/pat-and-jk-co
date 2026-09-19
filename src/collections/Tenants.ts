import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { superAdminOnly } from '../access/roles'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../hooks/revalidateFrontend'

/**
 * A tenant is one brand under PJK (PJK itself, Phulhaar Gallery, …).
 * Each brand owns its own pages, posts, media, forms and site settings,
 * and is served on the domains listed here — all from this one codebase.
 */
export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: {
    singular: 'Brand',
    plural: 'Brands',
  },
  access: {
    create: superAdminOnly,
    delete: superAdminOnly,
    read: authenticated,
    update: superAdminOnly,
  },
  admin: {
    defaultColumns: ['name', 'slug', 'domains'],
    description:
      'Each brand gets its own website on its own domain, sharing this admin panel and design system.',
    group: 'Administration',
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description:
          'Short lowercase identifier, e.g. "pjk" or "phulhaar". Do not change once live.',
      },
    },
    {
      name: 'domains',
      type: 'array',
      admin: {
        description:
          'Hostnames this brand is served on, without https:// — e.g. pjk.co.in. The first one is treated as the primary domain.',
      },
      fields: [
        {
          name: 'domain',
          type: 'text',
          required: true,
          index: true,
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateFrontend],
    afterDelete: [revalidateFrontendAfterDelete],
  },
}
