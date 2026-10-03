import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import type { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import type { Plugin } from 'payload'

import { authenticated } from '@/access/authenticated'
import { isSuperAdmin, superAdminOnly, superAdminOnlyField } from '@/access/roles'
import {
  protectSubmission,
  readSubmissions,
  submissionTenantField,
} from '@/collections/FormSubmissions/overrides'
import { revalidateFrontend } from '@/hooks/revalidateFrontend'
import type { Config, Page, Post, Venture } from '@/payload-types'
import { emailFooter } from '@/email/footer'
import { blobEnvironmentPrefix } from '@/members/storage'
import { docPath } from '@/utilities/docHref'
import { getServerSideURL } from '@/utilities/getURL'

type SeoDoc = Page | Post | Venture

const generateTitle: GenerateTitle<SeoDoc> = ({ doc }) =>
  (doc && 'name' in doc ? doc.name : doc?.title) || ''

const generateURL: GenerateURL<SeoDoc> = ({ doc, collectionSlug }) =>
  `${getServerSideURL()}${docPath(collectionSlug ?? 'pages', doc?.slug)}`

export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts', 'ventures'],
    overrides: {
      admin: { group: 'Website' },
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'The old path to redirect from, e.g. /old-page',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateFrontend],
      },
    },
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
      country: false,
      state: false,
    },
    // Every notification ends with the brand's registered office, like the site's other emails
    beforeEmail: async (emails, params) => {
      // Typed as the before-change arguments, but called from afterChange with the saved doc;
      // protectSubmission has set the brand on both by then
      const { req, data } = params
      const saved = (params as { doc?: { tenant?: unknown } }).doc
      const raw = saved?.tenant ?? data?.tenant
      const tenant = raw && typeof raw === 'object' ? (raw as { id: number }).id : (raw as number)
      const footer = await emailFooter(req.payload, tenant)
      return emails.map((email) => ({ ...email, html: `${email.html}${footer.html}` }))
    },
    formOverrides: {
      admin: { group: 'Enquiries' },
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          // Who is notified of a submission is internal: the public API may read a form to render
          // it, but not the inboxes it reports to
          if ('name' in field && field.name === 'emails') {
            return { ...field, access: { read: authenticated } } as typeof field
          }
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateFrontend],
      },
    },
    formSubmissionOverrides: {
      admin: {
        group: 'Enquiries',
        defaultColumns: ['form', 'createdAt', 'tenant'],
        description: 'Messages sent through the website forms. Newest first.',
      },
      defaultSort: '-createdAt',
      access: {
        read: readSubmissions,
        update: superAdminOnly,
        delete: authenticated,
      },
      fields: ({ defaultFields }) => [...defaultFields, submissionTenantField],
      hooks: {
        beforeChange: [protectSubmission],
      },
    },
  }),
  // Must come after the plugins above so their collections (forms, redirects) exist
  multiTenantPlugin<Config>({
    tenantSelectorLabel: 'Brand',
    collections: {
      pages: {},
      posts: {},
      categories: {},
      media: {},
      ventures: {},
      people: {},
      openings: {},
      forms: {},
      redirects: {},
      'site-settings': { isGlobal: true },
      'visitor-counts': { isGlobal: true },
    },
    tenantsArrayField: {
      includeDefaultField: true,
      // Only super admins can assign brands to users
      arrayFieldAccess: {
        create: superAdminOnlyField,
        update: superAdminOnlyField,
      },
    },
    userHasAccessToAllTenants: (user) => isSuperAdmin(user),
  }),
  vercelBlobStorage({
    // Enabled automatically on Vercel once a Blob store is connected; local dev writes to public/media
    enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    // Add the plugin's fields (the per-file `prefix` above all) whether or not it is enabled, so
    // the schema is the same locally, where migrations are generated, as on Vercel. Without this,
    // portfolio_images had no `prefix` column and every query on it failed once deployed.
    alwaysInsertFields: true,
    clientUploads: true,
    collections: {
      media: true,
      // Served through Payload's file route, which applies the collection's read rule
      // Kept apart from production's on preview deployments (src/members/storage.ts)
      'portfolio-images': { prefix: `${blobEnvironmentPrefix()}portfolio` },
    },
    token: process.env.BLOB_READ_WRITE_TOKEN || '',
  }),
]
