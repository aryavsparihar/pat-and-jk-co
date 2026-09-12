import type { Metadata, Viewport } from 'next'

import { Cormorant_Garamond, Inter } from 'next/font/google'
import { draftMode } from 'next/headers'
import Script from 'next/script'
import React from 'react'

import { AdminBar } from '@/components/AdminBar'
import { getServerSideURL } from '@/utilities/getURL'
import { cn } from '@/utilities/ui'

import './globals.css'

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { isEnabled } = await draftMode()

  return (
    <html
      className={cn(serif.variable, sans.variable)}
      data-scroll-behavior="smooth"
      lang="en-IN"
      suppressHydrationWarning
    >
      <head>
        {/* Marks JS as available before first paint so scroll-reveal never hides content without JS */}
        <Script id="js-flag" strategy="beforeInteractive">
          {"document.documentElement.classList.add('js')"}
        </Script>
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
