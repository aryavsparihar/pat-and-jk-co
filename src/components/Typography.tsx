import { cn } from '@/utilities/ui'
import React from 'react'

/**
 * Renders a CMS heading, turning *asterisk-wrapped* words into italics —
 * editors can emphasise a word ("A *quiet* revolution") without a rich-text field.
 */
export const Emphasis: React.FC<{ text?: string | null }> = ({ text }) => {
  if (!text) return null
  const parts = text.split(/(\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <em key={i}>{part.slice(1, -1)}</em>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  )
}

type HeadingProps = {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p'
  className?: string
  text?: string | null
}

export const Heading: React.FC<HeadingProps> = ({ as: Tag = 'h2', className, text }) => {
  if (!text) return null
  return (
    <Tag className={className}>
      <Emphasis text={text} />
    </Tag>
  )
}

export const Eyebrow: React.FC<{ children?: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  if (!children) return null
  return <p className={cn('eyebrow', className)}>{children}</p>
}

/** The leaf ornament from the logo. `rule` adds hairlines on either side. */
export const Ornament: React.FC<{ className?: string; rule?: boolean }> = ({ className, rule }) =>
  rule ? (
    <div aria-hidden className={cn('ornament-rule', className)}>
      <span className="ornament mx-3" />
    </div>
  ) : (
    <span aria-hidden className={cn('ornament', className)} />
  )

type SectionHeaderProps = {
  align?: 'left' | 'center' | null
  className?: string
  eyebrow?: string | null
  heading?: string | null
  headingAs?: 'h1' | 'h2'
  headingClassName?: string
  intro?: string | null
}

/** Eyebrow + heading + intro, used at the top of most blocks. */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  align = 'left',
  className,
  eyebrow,
  heading,
  headingAs = 'h2',
  headingClassName = 'display-lg',
  intro,
}) => {
  if (!eyebrow && !heading && !intro) return null
  const centered = align === 'center'
  return (
    <header className={cn(centered && 'mx-auto text-center', 'max-w-3xl', className)}>
      <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
      <Heading as={headingAs} className={headingClassName} text={heading} />
      {intro && <p className={cn('lede mt-6', centered && 'mx-auto', 'max-w-2xl')}>{intro}</p>}
    </header>
  )
}
