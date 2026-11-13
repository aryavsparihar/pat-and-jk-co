import type { Metadata } from 'next'

import React from 'react'

import { BrandSvg } from '@/components/brand/BrandSvg'
import { HelpForm } from '@/components/help/HelpForm'
import styles from '@/components/help/help.module.css'
import { BRAND } from '@/email/layout'
import { createFormToken } from '@/members/formToken'

// A fresh form token for every visit, and the per-request nonce the page policy needs
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Help Center | ${BRAND}`,
  description: `Raise a request with the ${BRAND} team: artists and trade partners.`,
}

/**
 * pjk.co.in/help, the Help Center, laid out exactly as the founder sent it (13 November 2026): the
 * email template's header (green bar, the PJK logo, the name and "Help Center"), the Raise a
 * Request form, and the email template's footer. None of the website's own header or footer: the
 * proxy serves this page outside the brand pages (src/proxy.ts).
 */
export default function HelpCenterPage() {
  return (
    <div className={styles.page}>
      <div className={styles.topbar} />
      <header className={styles.header}>
        <div className={styles.bar}>
          <a aria-label={`${BRAND} home`} className={styles.logoLink} href="/">
            <BrandSvg className={styles.logo} name="logo" title={BRAND} />
          </a>
          <div className={styles.right}>
            <span className={styles.name}>{BRAND}</span>
            <span aria-hidden className={styles.divider} />
            <span className={styles.hc}>Help Center</span>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <h1 className={styles.h1}>Raise a Request</h1>
        <p className={styles.lead}>Tell us who you are, and we&rsquo;ll take it from there.</p>
        <HelpForm formToken={createFormToken()} />
      </main>
      <footer className={styles.footer}>
        <div className={styles.bar}>
          <span>
            <a href="/privacy">Privacy Policy</a>&middot;<a href="/privacy">Statutory Notice</a>
          </span>
          <span>
            &copy; {new Date().getFullYear()} {BRAND} All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  )
}
