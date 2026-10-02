/**
 * Where member uploads live in the Blob store, by environment. Production keeps the plain folders;
 * a preview deployment writes under preview/, so trying the onboarding on a preview can never put
 * a file in, or import one from, production's folders. (The store itself is shared.)
 */
export const blobEnvironmentPrefix = (): string => {
  const env = process.env.VERCEL_ENV
  if (!env || env === 'production') return ''
  return `${env}/`
}
