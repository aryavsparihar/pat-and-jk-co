'use client'

import { cn } from '@/utilities/ui'
import React, { useEffect, useRef } from 'react'

type Props = {
  as?: 'div' | 'section' | 'li' | 'article' | 'header'
  children: React.ReactNode
  className?: string
  /** Stagger in milliseconds */
  delay?: number
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>

/**
 * Fades content up as it scrolls into view. Hidden state only applies when JS has run
 * (see `.js .reveal` in globals.css), and it's disabled for reduced-motion users.
 */
export const Reveal: React.FC<Props> = ({
  as: Tag = 'div',
  children,
  className,
  delay,
  style,
  ...rest
}) => {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn('reveal', className)}
      style={delay ? { ...style, ['--reveal-delay' as string]: `${delay}ms` } : style}
      {...rest}
    >
      {children}
    </Tag>
  )
}
