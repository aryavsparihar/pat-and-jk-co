'use client'

import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'

type Props = React.ComponentProps<typeof NextLink>

/**
 * next/link, but a page is fetched ahead only when someone shows they may open it: the pointer
 * over the link, keyboard focus on it, or a finger touching it. Next.js's default fetches every
 * link on screen as soon as it appears, which on the homepage meant 21 requests on every visit,
 * competing with the page's own fonts and pictures on a slow phone, and starting a server
 * function each time for the dynamic sign-in page. A hover or a touch is still a good head start:
 * by the click, the page is usually here.
 *
 * Pass prefetch={true} for a link that is almost certainly the next step.
 */
const IntentLink = React.forwardRef<HTMLAnchorElement, Props>(function IntentLink(
  { href, prefetch, onMouseEnter, onFocus, onTouchStart, ...rest },
  ref,
) {
  const router = useRouter()
  const warm = () => {
    if (prefetch !== undefined && prefetch !== null) return
    const path = typeof href === 'string' ? href : href.pathname
    if (path?.startsWith('/') && !path.startsWith('//')) router.prefetch(path)
  }
  return (
    <NextLink
      href={href}
      onFocus={(event) => {
        warm()
        onFocus?.(event)
      }}
      onMouseEnter={(event) => {
        warm()
        onMouseEnter?.(event)
      }}
      onTouchStart={(event) => {
        warm()
        onTouchStart?.(event)
      }}
      prefetch={prefetch ?? false}
      ref={ref}
      {...rest}
    />
  )
})

export default IntentLink
