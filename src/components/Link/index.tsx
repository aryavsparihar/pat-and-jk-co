import { cn } from '@/utilities/ui'
import { referenceHref } from '@/utilities/docHref'
import Link from 'next/link'
import React from 'react'

export type CMSLinkAppearance = 'inline' | 'default' | 'outline' | 'text'

export type CMSLinkType = {
  appearance?: CMSLinkAppearance | null
  children?: React.ReactNode
  className?: string
  label?: string | null
  newTab?: boolean | null
  reference?: {
    relationTo: string
    value: unknown
  } | null
  size?: 'sm' | 'default' | null
  type?: 'custom' | 'reference' | null
  url?: string | null
}

export const resolveLinkHref = ({
  type,
  reference,
  url,
}: Pick<CMSLinkType, 'type' | 'reference' | 'url'>) =>
  (type === 'reference' ? referenceHref(reference) : url) || null

const appearanceClass: Record<Exclude<CMSLinkAppearance, 'inline'>, string> = {
  default: 'btn btn-solid',
  outline: 'btn btn-outline',
  text: 'btn-text',
}

/** Renders a link configured in the CMS (internal document or custom URL) in the chosen style. */
export const CMSLink: React.FC<CMSLinkType> = (props) => {
  const { appearance = 'inline', children, className, label, newTab, size } = props

  const href = resolveLinkHref(props)
  if (!href) return null

  const isExternal =
    /^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('tel:')
  const newTabProps = newTab ? { rel: 'noopener noreferrer', target: '_blank' } : {}
  const classes = cn(
    appearance && appearance !== 'inline' && appearanceClass[appearance],
    appearance !== 'inline' && appearance !== 'text' && size === 'sm' && 'btn-sm',
    className,
  )
  const showArrow = appearance === 'text' || appearance === 'default'

  const content = (
    <>
      {label}
      {children}
      {showArrow && (
        <span aria-hidden className="arrow">
          {newTab || isExternal ? '↗' : '→'}
        </span>
      )}
    </>
  )

  if (isExternal) {
    return (
      <a className={classes} href={href} {...newTabProps}>
        {content}
      </a>
    )
  }

  return (
    <Link className={classes} href={href} {...newTabProps}>
      {content}
    </Link>
  )
}
