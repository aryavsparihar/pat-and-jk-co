import { cn } from '@/utilities/ui'
import React from 'react'

/**
 * Renders a CMS heading, turning *asterisk-wrapped* words into italics,
 * so editors can emphasise a word without a rich-text field.
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
  as?: 'h1' | 'h2' | 'h3' | 'p'
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

/** Small-capitals label, e.g. a section name in the margin. */
export const Label: React.FC<{
  children?: React.ReactNode
  className?: string
  as?: 'p' | 'span'
}> = ({ children, className, as: Tag = 'p' }) => {
  if (!children) return null
  return <Tag className={cn('label', className)}>{children}</Tag>
}

/** The leaf ornament from the logo. */
export const Ornament: React.FC<{ className?: string }> = ({ className }) => (
  <span aria-hidden className={cn('ornament', className)} />
)

type SectionProps = {
  children: React.ReactNode
  className?: string
  id?: string
  /** Shown in small capitals in the left margin, like a running head in a book */
  label?: string | null
  /** Hairline above the section (default true) */
  rule?: boolean
}

/**
 * The page grid used by almost every block: a narrow margin column holding the section's
 * label, and a wide column for its content. Sections are divided by hairline rules.
 */
export const Section: React.FC<SectionProps> = ({
  children,
  className,
  id,
  label,
  rule = true,
}) => (
  <section className={cn('section', className)} id={id}>
    <div className="container">
      <div className={cn('grid gap-x-12 gap-y-5 md:grid-cols-12', rule && 'section-rule')}>
        <div className="md:col-span-3">
          <Label className="md:sticky md:top-28">{label}</Label>
        </div>
        <div className="min-w-0 md:col-span-9">{children}</div>
      </div>
    </div>
  </section>
)

/** Heading + optional intro at the top of a section's content column. */
export const SectionHeading: React.FC<{
  heading?: string | null
  intro?: string | null
  className?: string
}> = ({ heading, intro, className }) => {
  if (!heading && !intro) return null
  return (
    <header className={cn('mb-10 md:mb-12', className)}>
      <Heading className="display-md max-w-[22ch]" text={heading} />
      {intro && <p className={cn('lede measure', heading && 'mt-5')}>{intro}</p>}
    </header>
  )
}
