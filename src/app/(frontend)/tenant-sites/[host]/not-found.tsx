import Link from 'next/link'
import React from 'react'

export default function BrandNotFound() {
  return (
    <section className="pb-[clamp(5rem,10vw,8rem)] pt-[clamp(4rem,9vw,7.5rem)]">
      <div className="container grid gap-x-12 gap-y-5 md:grid-cols-12">
        <div className="md:col-span-3 md:pt-4">
          <p className="label">Page not found</p>
        </div>
        <div className="md:col-span-9">
          <h1 className="display-xl max-w-[14ch]">We could not find that page.</h1>
          <p className="lede measure mt-8">
            The link may be out of date, or the page may have moved.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link className="btn btn-solid" href="/">
              Home page
            </Link>
            <Link className="link link-caps" href="/contact">
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
