'use client'

import Link from 'next/link'
import React from 'react'

/**
 * When a page fails on the server or in the browser. Says so plainly, offers to try again, and
 * gives Next's reference for the failure (a hash, nothing personal) so our team can find it in
 * the logs. Never shows the error itself: its message, stack or any library name.
 */
export default function BrandError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <section className="pb-[clamp(5rem,10vw,8rem)] pt-[clamp(4rem,9vw,7.5rem)]">
      <div className="container grid gap-x-12 gap-y-5 md:grid-cols-12">
        <div className="md:col-span-3 md:pt-4">
          <p className="label">Something went wrong</p>
        </div>
        <div className="md:col-span-9">
          <h1 className="display-xl max-w-[16ch]">This page could not be shown just now.</h1>
          <p className="lede measure mt-8">
            The fault is on our side. Please try again in a moment. Anything you saved before is
            still saved.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <button className="btn btn-solid min-h-11" onClick={() => reset()} type="button">
              Try again
            </button>
            <Link className="link link-caps" href="/">
              Home page
            </Link>
          </div>
          <p className="muted mt-10 text-base">
            If it keeps happening, write to{' '}
            <a className="link" href="mailto:hello@pjk.co.in">
              hello@pjk.co.in
            </a>
            {error.digest ? ` and quote ${error.digest}` : ''}.
          </p>
        </div>
      </div>
    </section>
  )
}
