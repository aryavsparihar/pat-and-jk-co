/** "13 September 2026" — Indian English date order, stable across server and client. */
export const formatDate = (timestamp: string): string =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(timestamp))
