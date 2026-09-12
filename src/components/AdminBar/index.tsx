'use client'

import type { PayloadAdminBarProps, PayloadMeUser } from '@payloadcms/admin-bar'

import { cn } from '@/utilities/ui'
import { useSelectedLayoutSegments } from 'next/navigation'
import { PayloadAdminBar } from '@payloadcms/admin-bar'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import './index.scss'

import { getClientSideURL } from '@/utilities/getURL'

const collectionLabels = {
  pages: { plural: 'Pages', singular: 'Page' },
  posts: { plural: 'Journal', singular: 'Journal post' },
  ventures: { plural: 'Ventures', singular: 'Venture' },
}

const Title: React.FC = () => <span>Admin</span>

/** A slim bar shown only to signed-in editors, with quick links back into the admin panel. */
export const AdminBar: React.FC<{
  adminBarProps?: PayloadAdminBarProps
}> = (props) => {
  const { adminBarProps } = props || {}
  const segments = useSelectedLayoutSegments()
  const [show, setShow] = useState(false)
  const collection: keyof typeof collectionLabels = segments.includes('journal')
    ? 'posts'
    : segments.includes('ventures')
      ? 'ventures'
      : 'pages'
  const router = useRouter()

  const onAuthChange = React.useCallback((user: PayloadMeUser) => {
    setShow(Boolean(user?.id))
  }, [])

  return (
    <div
      className={cn('admin-bar bg-foreground py-1.5 text-background', {
        block: show,
        hidden: !show,
      })}
    >
      <div className="container">
        <PayloadAdminBar
          {...adminBarProps}
          className="py-1.5 text-background"
          classNames={{
            controls: 'font-medium text-background',
            logo: 'text-background',
            user: 'text-background',
          }}
          cmsURL={getClientSideURL()}
          collectionSlug={collection}
          collectionLabels={collectionLabels[collection]}
          logo={<Title />}
          onAuthChange={onAuthChange}
          onPreviewExit={() => {
            fetch('/next/exit-preview').then(() => {
              router.push('/')
              router.refresh()
            })
          }}
          style={{
            backgroundColor: 'transparent',
            padding: 0,
            position: 'relative',
            zIndex: 'unset',
          }}
        />
      </div>
    </div>
  )
}
