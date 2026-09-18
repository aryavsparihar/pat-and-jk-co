import type { CollectionConfig } from 'payload'

import {
  BlocksFeature,
  BlockquoteFeature,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  OrderedListFeature,
  UnorderedListFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { Banner } from '../../blocks/Banner/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { seoTab } from '../../fields/seo'
import { tenantSlugField } from '../../fields/slug'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../../hooks/revalidateFrontend'
import { generatePreviewPath } from '../../utilities/previewPath'

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  labels: {
    singular: 'Journal post',
    plural: 'Journal',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  // What's populated when a post is referenced (journal feed cards, links)
  defaultPopulate: {
    title: true,
    slug: true,
    excerpt: true,
    publishedAt: true,
    heroImage: true,
    categories: true,
    meta: {
      image: true,
      description: true,
    },
  },
  admin: {
    defaultColumns: ['title', 'publishedAt', '_status', 'updatedAt'],
    group: 'Website',
    description:
      'News and stories. Each post appears automatically in any “Journal feed” block on the site.',
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({ slug: data?.slug, collection: 'posts', tenant: data?.tenant, req }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: data?.slug as string,
        collection: 'posts',
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
              name: 'excerpt',
              type: 'textarea',
              admin: {
                description: 'One or two sentences shown on journal cards and in search results.',
              },
            },
            {
              name: 'heroImage',
              type: 'upload',
              relationTo: 'media',
            },
            {
              name: 'content',
              type: 'richText',
              editor: lexicalEditor({
                features: ({ rootFeatures }) => [
                  ...rootFeatures,
                  HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
                  UnorderedListFeature(),
                  OrderedListFeature(),
                  BlockquoteFeature(),
                  BlocksFeature({ blocks: [Banner, MediaBlock] }),
                  FixedToolbarFeature(),
                  InlineToolbarFeature(),
                  HorizontalRuleFeature(),
                ],
              }),
              label: false,
              required: true,
            },
          ],
        },
        seoTab,
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            if (siblingData._status === 'published' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      admin: {
        position: 'sidebar',
      },
      hasMany: true,
      relationTo: 'categories',
    },
    tenantSlugField('posts'),
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
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
