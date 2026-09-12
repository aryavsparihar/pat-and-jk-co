import Link from 'next/link'
import React from 'react'

export default function BrandNotFound() {
  return (
    <section className="section">
      <div className="container flex flex-col items-center text-center">
        <span aria-hidden className="ornament mb-10 text-primary" />
        <p className="eyebrow">Page not found</p>
        <h1 className="display-xl mt-6 max-w-[16ch]">
          This page has <em>wandered off</em>.
        </h1>
        <p className="lede mt-7 max-w-lg">
          The link may be old, or the page may have moved. Everything else is right where you left
          it.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link className="btn btn-solid" href="/">
            Return home{' '}
            <span aria-hidden className="arrow">
              →
            </span>
          </Link>
          <Link className="btn btn-outline" href="/contact">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  )
}
