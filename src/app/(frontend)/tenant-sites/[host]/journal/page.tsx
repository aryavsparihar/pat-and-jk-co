import type { Metadata } from 'next'

import { notFound } from 'next/navigation'
import React from 'react'

import { HouseSection } from '@/components/house/HouseSection'
import { JournalEntry } from '@/components/house/JournalEntry'
import { JournalList } from '@/components/house/JournalList'
import { houseMetadata } from '@/components/house/meta'
import { getPosts } from '@/utilities/queries'
import { getTenantContext } from '@/utilities/tenant'

type Args = { params: Promise<{ host: string }> }

/** The Journal, as in the founder's design (Journal.html; his brief, section 6). Posts stay in the admin. */
export default async function JournalIndex({ params }: Args) {
  const { host } = await params
  const ctx = await getTenantContext(host)
  if (!ctx) notFound()
  const posts = await getPosts(ctx.tenant.id, { limit: 200 })

  return (
    <div className="house">
      <div className="house-wrap">
        <HouseSection hero label="Journal">
          <h1 className="house-h1">Journal</h1>
          <p className="house-lead m-0 max-w-[700px]">
            News and notes from the house, and from the artists and ventures it works with.
          </p>
        </HouseSection>

        <section className="flex flex-wrap gap-8 border-t border-[var(--rule)] pb-[clamp(4rem,9vw,7.5rem)] pt-[clamp(3rem,6vw,4.5rem)]">
          <div className="house-lab">All entries</div>
          <div className="house-con">
            <JournalList
              entries={posts.map((post) => ({
                id: post.id,
                categories: (post.categories ?? []).flatMap((c) =>
                  typeof c === 'object' && c.slug ? [c.slug] : [],
                ),
                node: <JournalEntry post={post} withPicture />,
              }))}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { host } = await params
  return houseMetadata(
    host,
    '/journal',
    'Journal',
    'News and notes from the house, and from the artists and ventures it works with.',
  )
}
