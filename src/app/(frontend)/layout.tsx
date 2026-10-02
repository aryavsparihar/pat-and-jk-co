import type { Metadata, Viewport } from 'next'

import localFont from 'next/font/local'
import { draftMode } from 'next/headers'
import React from 'react'

import { AdminBar } from '@/components/AdminBar'
import { getServerSideURL } from '@/utilities/getURL'
import { cn } from '@/utilities/ui'

import './globals.css'

/*
 * Both faces are served from the repository (src/app/(frontend)/fonts, Latin subset, SIL Open
 * Font License) rather than fetched from Google at build time. Google Fonts sometimes answers
 * with URLs Turbopack's font loader cannot parse, which fails the build at random
 * (vercel/next.js#99114). The files are Google's own, byte for byte, so nothing looks different.
 */

// next/font needs every value written out literally, so the six files of each face are listed

// Display face: high-contrast Garamond that matches the letterforms of the PJK logo
const display = localFont({
  src: [
    { path: './fonts/cormorant-garamond-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/cormorant-garamond-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-500-italic.woff2', weight: '500', style: 'italic' },
    { path: './fonts/cormorant-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-600-italic.woff2', weight: '600', style: 'italic' },
  ],
  variable: '--font-cormorant',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})

// Text face: a sturdier Garamond for reading, with true small capitals for labels and navigation
const text = localFont({
  src: [
    { path: './fonts/eb-garamond-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/eb-garamond-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/eb-garamond-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/eb-garamond-latin-500-italic.woff2', weight: '500', style: 'italic' },
    { path: './fonts/eb-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/eb-garamond-latin-600-italic.woff2', weight: '600', style: 'italic' },
  ],
  variable: '--font-eb-garamond',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
})

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = await draftMode()

  return (
    <html
      className={cn(display.variable, text.variable)}
      data-scroll-behavior="smooth"
      lang="en-IN"
      suppressHydrationWarning
    >
      <head>
        <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
        <link href="/favicon-48.png" rel="icon" sizes="48x48" type="image/png" />
        <link href="/apple-touch-icon.png" rel="apple-touch-icon" />
      </head>
      <body>
        <AdminBar adminBarProps={{ preview: isEnabled }} />
        {children}
      </body>
    </html>
  )
}

export const metadata: Metadata = {
  metadataBase: new URL(getServerSideURL()),
}

export const viewport: Viewport = {
  themeColor: '#f6f3ec',
  width: 'device-width',
  initialScale: 1,
}
