import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { link } from '../fields/link'
import { isIndianPin } from '../utilities/address'
import { revalidateFrontend, revalidateFrontendAfterDelete } from '../hooks/revalidateFrontend'

const hexColour: TextFieldSingleValidation = (value) =>
  !value || /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value) ? true : 'Use a hex colour such as #0F2A18'

/** Six digits, not starting with 0, for an Indian address; anything for elsewhere */
const pinCode: TextFieldSingleValidation = (value, { siblingData }) => {
  const country = String((siblingData as { country?: string })?.country ?? 'India')
  if (!value || !/^(india|in|bharat)$/i.test(country.trim())) return true
  return isIndianPin(value) ? true : 'A PIN code is six digits, e.g. 184101'
}

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
/** Empty, or a full https:// link */
const httpsLink = (value: unknown) =>
  !value ||
  (typeof value === 'string' && /^https:\/\/\S+$/i.test(value.trim())) ||
  'Use the full link, starting https://'

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
    description: 'The name, logo, colours, navigation, footer and contact details of this brand.',
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
            {
              name: 'showVisitorCount',
              label: 'Show the visitor count',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                description:
                  'Displays the running number of visits beside the copyright line. The total itself is under Website → Visitor count.',
              },
            },
          ],
        },
        {
          label: 'Applications',
          description:
            'Whether artists and partners can apply on the website. While applications are closed, the application pages show the note below instead of the form, and nothing can be started or sent. Members who already have an account can still sign in.',
          fields: [
            {
              name: 'applicationsOpen',
              label: 'Applications are open',
              type: 'checkbox',
              defaultValue: false,
            },
            {
              name: 'applicationsClosedNote',
              label: 'Note while applications are closed',
              type: 'textarea',
              admin: {
                description:
                  'Shown on /collaborate/artists and /collaborate/partners. Leave empty for: “Applications open soon. Please come back in a little while.”',
              },
            },
            {
              name: 'reapplyAfterDays',
              label: 'Days before someone declined may apply again',
              type: 'number',
              min: 0,
              max: 1095,
              defaultValue: 90,
              admin: {
                description:
                  'Counted from the decision, and given on their account and in the email that tells them. 0 lets them apply again at once. Staff can end the wait early for one person from their application.',
              },
            },
            {
              // Replaced by reapplyAfterDays (October 2026). Kept, unused, so a rollback to the
              // release before still finds it; drop it in a later release
              name: 'reapplyAfterMonths',
              type: 'number',
              defaultValue: 6,
              admin: { hidden: true },
            },
            {
              name: 'artistTerms',
              label: 'Artists’ Terms & Conditions (PDF)',
              type: 'upload',
              relationTo: 'media',
              filterOptions: { mimeType: { equals: 'application/pdf' } },
              admin: {
                description:
                  'Linked on the last step of the artist application. While a document is here, an artist must tick that they agree and type I AGREE before sending, and which document they agreed to is kept with their application. Upload a new one to change the terms; earlier agreements stay linked to the version agreed to.',
              },
            },
            {
              // Read by src/members/partnerAgreement.ts; nothing is public until text and version
              // are both given
              name: 'partnerAgreement',
              label: 'Partner/Trade Program agreement',
              type: 'group',
              admin: {
                description:
                  'Shown to every partner before they send their application: they read it to the end and type I AGREE. Until both the text and its version are given here, partners can fill in their application but cannot send it.',
              },
              fields: [
                {
                  name: 'title',
                  type: 'text',
                  defaultValue: 'Partner/Trade Program agreement',
                  maxLength: 120,
                },
                {
                  name: 'version',
                  type: 'text',
                  maxLength: 40,
                  admin: {
                    description:
                      'Change it whenever the text changes, for example 2026-11 or 1.1. Each partner’s application keeps the version they agreed to.',
                  },
                },
                { name: 'text', label: 'The agreement', type: 'richText' },
              ],
            },
          ],
        },
        {
          label: 'Contact & social',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'email',
                  label: 'General enquiries',
                  type: 'email',
                  admin: { width: '50%' },
                },
                { name: 'phone', type: 'text', admin: { width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'businessEmail',
                  label: 'Business enquiries',
                  type: 'email',
                  admin: {
                    width: '50%',
                    description: 'Partnerships, trade and retail clients.',
                  },
                },
                {
                  name: 'technicalEmail',
                  label: 'Technical enquiries',
                  type: 'email',
                  admin: {
                    width: '50%',
                    description: 'Anything to do with the website.',
                  },
                },
              ],
            },
            {
              name: 'office',
              label: 'Registered office',
              type: 'group',
              admin: {
                description:
                  'Shown in the footer, on the contact page, at the end of the privacy policy, in emails and to search engines, always with a “Get directions” link.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'line1',
                      label: 'Address line 1',
                      type: 'text',
                      admin: { width: '50%', description: 'e.g. Ward No. 7' },
                    },
                    {
                      name: 'line2',
                      label: 'Address line 2',
                      type: 'text',
                      admin: { width: '50%', description: 'e.g. ITI Road' },
                    },
                  ],
                },
                {
                  name: 'landmark',
                  type: 'text',
                  admin: { description: 'e.g. Opposite Brahman Sabha' },
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'city', label: 'City or town', type: 'text', admin: { width: '33%' } },
                    { name: 'state', type: 'text', admin: { width: '33%' } },
                    {
                      name: 'postalCode',
                      label: 'PIN code',
                      type: 'text',
                      validate: pinCode,
                      admin: { width: '33%' },
                    },
                  ],
                },
                {
                  name: 'country',
                  type: 'text',
                  defaultValue: 'India',
                },
              ],
            },
            {
              name: 'mapUrl',
              label: 'Map link',
              type: 'text',
              admin: {
                description:
                  'Optional. Where “Get directions” leads (https://…). Leave empty to use Google Maps directions to the address above.',
              },
            },
            {
              name: 'address',
              label: 'Address (free text, earlier version)',
              type: 'textarea',
              admin: {
                description:
                  'Only used while the registered office above is empty. Safe to clear once that is filled in.',
              },
            },
            {
              name: 'phulhaarSocial',
              label: "Phulhaar's social accounts",
              type: 'group',
              admin: {
                description:
                  "Full links, starting https://. Shown on Phulhaar's venture page and at the foot of the email that tells an artist their application was declined. An empty one is left out.",
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'instagram',
                      label: 'Instagram',
                      type: 'text',
                      validate: httpsLink,
                      admin: { width: '33%' },
                    },
                    {
                      name: 'facebook',
                      label: 'Facebook',
                      type: 'text',
                      validate: httpsLink,
                      admin: { width: '33%' },
                    },
                    {
                      name: 'pinterest',
                      label: 'Pinterest',
                      type: 'text',
                      validate: httpsLink,
                      admin: { width: '33%' },
                    },
                  ],
                },
              ],
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
