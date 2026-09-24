import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { bodyLexical } from '../fields/defaultLexical'
import { seoTab } from '../fields/seo'
import { tenantSlugField } from '../fields/slug'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../hooks/revalidateFrontend'
import { generatePreviewPath } from '../utilities/previewPath'

/**
 * The ventures under PJK, shown on the parent site (ventures grid, spotlight, detail page).
 * A venture can later be given its own full website by adding it as a Brand (tenant).
 */
export const Ventures: CollectionConfig<'ventures'> = {
  slug: 'ventures',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    name: true,
    slug: true,
    stage: true,
    tagline: true,
    summary: true,
    sector: true,
    cover: true,
    logo: true,
    website: true,
    opening: true,
  },
  admin: {
    defaultColumns: ['name', 'stage', 'order', '_status'],
    group: 'Ventures & people',
    description:
      'The ventures under PJK. “Stage” decides whether a venture gets its own page or appears as a teaser.',
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: data?.slug,
          collection: 'ventures',
          tenant: data?.tenant,
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'ventures',
        tenant: data?.tenant as number,
        req,
      }),
    useAsTitle: 'name',
  },
  defaultSort: 'order',
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'tagline',
      type: 'text',
      admin: {
        description: 'One line, e.g. "Contemporary fine art curation & framing".',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'summary',
              type: 'textarea',
              admin: {
                description: 'Two or three sentences for cards and the spotlight block.',
              },
            },
            {
              name: 'caption',
              type: 'textarea',
              admin: {
                description:
                  'A few lines in the venture’s own voice, set beneath its mark. Leave a blank line between paragraphs.',
              },
            },
            {
              name: 'description',
              type: 'richText',
              editor: bodyLexical,
              admin: {
                description: 'The full story, shown on the venture page.',
              },
            },
            {
              name: 'highlights',
              type: 'array',
              admin: {
                description: 'Short facts shown beside the description, e.g. "Focus — Fine art".',
                initCollapsed: true,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'label', type: 'text', required: true, admin: { width: '40%' } },
                    { name: 'value', type: 'text', required: true, admin: { width: '60%' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Media',
          fields: [
            {
              name: 'cover',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: 'Landscape image. Without one, a typographic brand panel is shown.',
              },
            },
            {
              name: 'logo',
              type: 'upload',
              relationTo: 'media',
            },
          ],
        },
        seoTab,
      ],
    },
    {
      name: 'stage',
      type: 'select',
      defaultValue: 'live',
      required: true,
      options: [
        { label: 'Flagship', value: 'flagship' },
        { label: 'Active', value: 'live' },
        { label: 'Coming soon', value: 'coming-soon' },
      ],
      admin: {
        position: 'sidebar',
        description: '"Coming soon" ventures appear as teaser cards without their own page.',
      },
    },
    {
      name: 'opening',
      label: 'Opening',
      type: 'group',
      admin: {
        position: 'sidebar',
        description:
          'For a venture that has been announced but has not opened yet. The notice disappears by itself once the date has passed.',
      },
      fields: [
        {
          name: 'date',
          label: 'Opening date',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'd MMMM yyyy' } },
        },
        {
          name: 'note',
          label: 'Occasion',
          type: 'text',
          admin: { description: 'e.g. “in celebration of Diwali”' },
        },
      ],
    },
    {
      name: 'sector',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'e.g. "Fine art"',
      },
    },
    {
      name: 'website',
      type: 'text',
      admin: {
        position: 'sidebar',
        description: 'External website, if the venture has one (https://…).',
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 10,
      admin: {
        position: 'sidebar',
        description: 'Lower numbers appear first.',
      },
    },
    tenantSlugField('ventures', 'name'),
  ],
  indexes: [{ fields: ['tenant', 'slug'], unique: true }],
  hooks: {
    afterChange: [revalidateFrontend],
    afterDelete: [revalidateFrontendAfterDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 200,
      },
    },
    maxPerDoc: 25,
  },
}
