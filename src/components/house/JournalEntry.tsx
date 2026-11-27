import type { Post } from '@/payload-types'

import Link from '@/components/IntentLink'
import { Media } from '@/components/Media'
import { docPath } from '@/utilities/docHref'
import { formatDate } from '@/utilities/formatDateTime'
import { readingMinutes } from '@/utilities/readingTime'
import React from 'react'

/** "News · 4 min read": the post's first category, and how long it takes to read */
export const postLine = (post: Post) => {
  const category = (post.categories ?? []).find((c) => typeof c === 'object')
  const minutes = `${readingMinutes(post.content)} min read`
  return category && typeof category === 'object' ? `${category.title} · ${minutes}` : minutes
}

/**
 * One Journal entry as a single link (Main.html, Journal.html): the date and category on the
 * left, the title underlined and the summary beside them, and, on the Journal page, its picture,
 * or the PJK monogram where it has none.
 */
export const JournalEntry: React.FC<{ post: Post; withPicture?: boolean }> = ({
  post,
  withPicture = false,
}) => {
  const hero = post.heroImage && typeof post.heroImage === 'object' ? post.heroImage : null
  return (
    <Link
      className="house-card-link flex flex-wrap items-center gap-x-10 gap-y-6 border-b border-t border-b-[#d9d4c8] border-t-[#9aa79e] py-8"
      href={docPath('posts', post.slug ?? '')}
    >
      <p className="house-small m-0 flex-[0_0_170px]">
        {post.publishedAt && (
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        )}
        <br />
        {postLine(post)}
      </p>
      <div className="min-w-0 flex-[1_1_360px]">
        <h3 className="house-card-title mb-2.5 font-display text-[clamp(1.6rem,2.4vw,2rem)] font-normal text-primary">
          {post.title}
        </h3>
        {post.excerpt && <p className="house-note m-0 text-lg leading-[1.6]">{post.excerpt}</p>}
      </div>
      {withPicture && (
        <div className="flex h-[140px] flex-[0_0_220px] items-center justify-center overflow-hidden bg-[#ece7dc]">
          {hero ? (
            <Media className="size-full" imgClassName="size-full object-cover" resource={hero} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- the transparent monogram
            <img
              alt=""
              className="h-auto w-[140px]"
              height={209}
              src="/brand/pjk-monogram.png"
              width={432}
            />
          )}
        </div>
      )}
    </Link>
  )
}
