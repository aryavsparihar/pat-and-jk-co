import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { pageBlocks } from '../../blocks'
import { seoTab } from '../../fields/seo'
import { tenantSlugField } from '../../fields/slug'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../../hooks/revalidateFrontend'
import { generatePreviewPath } from '../../utilities/previewPath'

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  // What's populated when a page is referenced from a link
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    description:
      'Every page is built from blocks. The page with slug "home" is the homepage. Publish to go live instantly.',
    group: 'Website',
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({ slug: data?.slug, collection: 'pages', tenant: data?.tenant, req }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'pages',
        tenant: data?.tenant as number,
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: pageBlocks,
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
        },
        seoTab,
      ],
    },
    {
      name: 'officeAddress',
      label: 'Registered office',
      type: 'group',
      admin: {
        position: 'sidebar',
        description:
          'End this page with the registered office from Site settings, for the privacy policy, terms or a contact page.',
      },
      fields: [
        { name: 'show', label: 'Show at the end of this page', type: 'checkbox' },
        {
          name: 'label',
          type: 'text',
          admin: {
            condition: (_, siblingData) => Boolean(siblingData?.show),
            description: 'The label in the margin, e.g. “Data controller”. Defaults to “Registered office”.',
          },
        },
        {
          name: 'note',
          type: 'textarea',
          admin: {
            condition: (_, siblingData) => Boolean(siblingData?.show),
            description: 'Optional. A sentence or two above the address.',
          },
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    tenantSlugField('pages'),
  ],
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  hooks: {
    afterChange: [revalidateFrontend],
    beforeChange: [populatePublishedAt],
    afterDelete: [revalidateFrontendAfterDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 200, // keeps live preview responsive
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
