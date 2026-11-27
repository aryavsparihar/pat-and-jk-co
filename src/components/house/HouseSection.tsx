import { cn } from '@/utilities/ui'
import React from 'react'

type Props = {
  label: string
  children: React.ReactNode
  className?: string
  contentClassName?: string
  id?: string
  /** The page's opening section, with the larger top margin */
  hero?: boolean
}

/** A section of a house page: its label on the left, the content beside it, under it on a phone */
export const HouseSection: React.FC<Props> = ({
  label,
  children,
  className,
  contentClassName,
  id,
  hero = false,
}) => (
  <section className={cn(hero ? 'house-hero' : 'house-sec', className)} id={id}>
    <div className="house-lab">{label}</div>
    <div className={cn('house-con', contentClassName)}>{children}</div>
  </section>
)
