import Link from 'next/link'
import React from 'react'

export default function NotFound() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center text-center">
      <span aria-hidden className="ornament mb-10 text-primary" />
      <h1 className="display-lg">Page not found.</h1>
      <Link className="btn btn-solid mt-10" href="/">
        Return home
      </Link>
    </main>
  )
}
