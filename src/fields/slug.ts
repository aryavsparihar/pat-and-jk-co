import type { CollectionSlug, Field, TextFieldSingleValidation } from 'payload'
import { slugField } from 'payload'

/**
 * Slug that must be unique within a brand (tenant) rather than across the whole database,
 * so every brand can have its own "home", "about", "contact"… pages.
 * Pair it with a compound index: `indexes: [{ fields: ['tenant', 'slug'], unique: true }]`.
 */
export const tenantSlugField = (collection: CollectionSlug, useAsSlug = 'title'): Field =>
  slugField({
    disableUnique: true,
    useAsSlug,
    overrides: (row) => {
      const slug = row.fields.find((f) => 'name' in f && f.name === 'slug')
      if (slug && slug.type === 'text') {
        slug.validate = (async (value, { data, id, req }) => {
          if (!value) return 'A slug is required'
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
            return 'Use lowercase letters, numbers and hyphens only, e.g. "our-story"'
          }
          const tenant = (data as { tenant?: unknown })?.tenant
          const tenantId = tenant && typeof tenant === 'object' ? (tenant as { id: unknown }).id : tenant
          if (!tenantId) return true
          const existing = await req.payload.count({
            collection,
            req,
            where: {
              and: [
                { slug: { equals: value } },
                { tenant: { equals: tenantId } },
                ...(id ? [{ id: { not_equals: id } }] : []),
              ],
            },
          })
          return existing.totalDocs > 0 ? `Another item in this brand already uses "${value}"` : true
        }) as TextFieldSingleValidation
      }
      return row
    },
  })
