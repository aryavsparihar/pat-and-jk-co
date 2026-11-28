/**
 * A private file sent to staff in the admin: a PDF or picture opens in the browser, anything else
 * is saved, and nothing is cached or sniffed.
 *
 * Streamed in parts of 1 MB, because Vercel refuses a function's response over 4.5 MB unless it
 * is streamed, and a curator's portfolio may be 20 MB, a contact attachment 10 MB.
 */
const CHUNK = 1024 * 1024

export const fileResponse = (
  bytes: Uint8Array,
  file: { filename: string; contentType: string },
): Response => {
  const name = file.filename.replace(/[^\w .()-]+/g, '_')
  const inline = /^(image\/(jpeg|png)|application\/pdf)$/.test(file.contentType)
  let offset = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close()
      controller.enqueue(bytes.subarray(offset, offset + CHUNK))
      offset += CHUNK
    },
  })
  return new Response(body, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  })
}
