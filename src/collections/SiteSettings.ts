import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { link } from '../fields/link'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../hooks/revalidateFrontend'

const hexColour: TextFieldSingleValidation = (value) =>
  !value || /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value) ? true : 'Use a hex colour such as #0F2A18'

const colourField = (name: string, label: string, defaultValue: string, description: string) => ({
  name,
  label,
  type: 'text' as const,
  defaultValue,
  validate: hexColour,
  admin: { description, width: '50%' },
})

/**
 * One settings document per brand (the multi-tenant plugin makes it behave like a global):
 * name, logo, colours, navigation, footer, contact details and social links.
 */
export const SiteSettings: CollectionConfig = {
  slug: 'site-settings',
  labels: {
    singular: 'Site settings',
    plural: 'Site settings',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Website',
    useAsTitle: 'siteName',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'General',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'siteName',
                  type: 'text',
                  required: true,
                  admin: { width: '60%', description: 'e.g. PAT and J.K. Co.' },
                },
                {
                  name: 'shortName',
                  type: 'text',
                  admin: { width: '40%', description: 'e.g. PJK' },
                },
              ],
            },
            {
              name: 'tagline',
              type: 'text',
            },
            {
              name: 'description',
              type: 'textarea',
              admin: {
                description: 'Default description for search engines and link previews.',
              },
            },
            {
              name: 'ogImage',
              label: 'Default social sharing image',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: '1200 × 630 px. Used when a page has no image of its own.',
              },
            },
          ],
        },
        {
          label: 'Brand',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'logo',
                  type: 'upload',
                  relationTo: 'media',
                  admin: {
                    width: '50%',
                    description: 'For light backgrounds. SVG preferred.',
                  },
                },
                {
                  name: 'logoOnDark',
                  label: 'Logo for dark backgrounds',
                  type: 'upload',
                  relationTo: 'media',
                  admin: {
                    width: '50%',
                    description: 'Used in the footer and on colour bands.',
                  },
                },
              ],
            },
            {
              name: 'wordmark',
              label: 'Compact logo (header)',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description:
                  'Optional smaller mark for the header, e.g. letters only. Falls back to the main logo.',
              },
            },
            {
              name: 'colours',
              type: 'group',
              admin: {
                description:
                  'The palette for this brand. Hairlines and hover states are derived from these automatically.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    colourField('primary', 'Brand colour', '#0F2A18', 'Buttons, links, footer.'),
                    colourField('background', 'Background', '#F6F3EC', 'The page colour.'),
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    colourField(
                      'surface',
                      'Paper tone',
                      '#EFEAE0',
                      'Cards and alternate sections.',
                    ),
                    colourField('foreground', 'Text', '#16201A', 'Body text.'),
                  ],
                },
              ],
            },
          ],
        },
        {
          label: 'Navigation',
          fields: [
            {
              name: 'headerNav',
              label: 'Header links',
              type: 'array',
              maxRows: 7,
              admin: { initCollapsed: true },
              fields: [link({ appearances: false })],
            },
            {
              name: 'enableHeaderCta',
              type: 'checkbox',
              label: 'Show a button at the end of the header',
              defaultValue: false,
            },
            link({
              appearances: false,
              overrides: {
                name: 'headerCta',
                label: 'Header button',
                admin: {
                  condition: (_, siblingData) => Boolean(siblingData?.enableHeaderCta),
                },
              },
            }),
          ],
        },
        {
          label: 'Footer',
          fields: [
            {
              name: 'footerBlurb',
              type: 'textarea',
              admin: { description: 'A sentence or two about the brand, shown beside the logo.' },
            },
            {
              name: 'footerNav',
              label: 'Footer links',
              type: 'array',
              maxRows: 10,
              admin: { initCollapsed: true },
              fields: [link({ appearances: false })],
            },
            {
              name: 'legalLinks',
              type: 'array',
              maxRows: 4,
              admin: { initCollapsed: true },
              fields: [link({ appearances: false })],
            },
            {
              name: 'copyrightName',
              type: 'text',
              admin: { description: 'Defaults to the site name.' },
            },
          ],
        },
        {
          label: 'Contact & social',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'email', type: 'email', admin: { width: '50%' } },
                { name: 'phone', type: 'text', admin: { width: '50%' } },
              ],
            },
            {
              name: 'address',
              type: 'textarea',
            },
            {
              name: 'mapUrl',
              type: 'text',
              admin: { description: 'Link to a map (e.g. Google Maps share link).' },
            },
            {
              name: 'socials',
              type: 'array',
              admin: { initCollapsed: true },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'platform',
                      type: 'select',
                      required: true,
                      admin: { width: '40%' },
                      options: [
                        { label: 'Instagram', value: 'instagram' },
                        { label: 'LinkedIn', value: 'linkedin' },
                        { label: 'Facebook', value: 'facebook' },
                        { label: 'X (Twitter)', value: 'x' },
                        { label: 'YouTube', value: 'youtube' },
                        { label: 'Pinterest', value: 'pinterest' },
                        { label: 'Behance', value: 'behance' },
                        { label: 'Other', value: 'other' },
                      ],
                    },
                    { name: 'url', type: 'text', required: true, admin: { width: '60%' } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateFrontend],
    afterDelete: [revalidateFrontendAfterDelete],
  },
}
