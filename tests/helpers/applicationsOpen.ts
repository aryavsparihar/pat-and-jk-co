import type { Payload } from 'payload'

/**
 * Opens applications on the default brand for the length of a test file, and puts things back
 * afterwards. Creates the brand and its settings if the database has none (as on CI), and
 * removes them again.
 */
export const openApplicationsForTests = async (payload: Payload): Promise<() => Promise<void>> => {
  const slug = process.env.DEFAULT_TENANT_SLUG || 'pjk'
  const context = { disableRevalidate: true }
  let tenant = (
    await payload.find({
      collection: 'tenants',
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  const createdTenant = !tenant
  tenant ??= await payload.create({
    collection: 'tenants',
    data: { name: 'Test brand', slug },
    overrideAccess: true,
    context,
  })

  let settings = (
    await payload.find({
      collection: 'site-settings',
      where: { tenant: { equals: tenant.id } },
      limit: 1,
      overrideAccess: true,
    })
  ).docs[0]
  const createdSettings = !settings
  const before = settings?.applicationsOpen ?? false
  settings = createdSettings
    ? await payload.create({
        collection: 'site-settings',
        data: { tenant: tenant.id, siteName: 'Test brand', applicationsOpen: true } as never,
        overrideAccess: true,
        context,
      })
    : await payload.update({
        collection: 'site-settings',
        id: settings!.id,
        data: { applicationsOpen: true },
        overrideAccess: true,
        context,
      })

  return async () => {
    if (createdSettings)
      await payload.delete({
        collection: 'site-settings',
        id: settings!.id,
        overrideAccess: true,
        context,
      })
    else
      await payload.update({
        collection: 'site-settings',
        id: settings!.id,
        data: { applicationsOpen: before },
        overrideAccess: true,
        context,
      })
    if (createdTenant)
      await payload.delete({ collection: 'tenants', id: tenant!.id, overrideAccess: true, context })
  }
}
