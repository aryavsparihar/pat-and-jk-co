import { cn } from '@/utilities/ui'
import * as React from 'react'

export const fieldClasses =
  'w-full rounded-[2px] border border-input bg-background px-4 text-[0.95rem] text-foreground transition-colors duration-300 placeholder:text-muted-foreground/70 hover:border-primary/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60'

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  type,
  ...props
}) => {
  return <input className={cn(fieldClasses, 'h-12', className)} type={type} {...props} />
}

export { Input }
