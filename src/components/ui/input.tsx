import { cn } from '@/utilities/ui'
import * as React from 'react'

// Underlined fields, like writing on a printed form
export const fieldClasses =
  'w-full rounded-none border-0 border-b border-input bg-transparent px-0 text-[1.15rem] text-[var(--text)] transition-colors duration-200 placeholder:text-muted-foreground/70 hover:border-primary focus:border-primary focus:outline-none focus:shadow-[0_1px_0_0_var(--primary)] aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-60'

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  type,
  ...props
}) => {
  return <input className={cn(fieldClasses, 'h-11', className)} type={type} {...props} />
}

export { Input }
