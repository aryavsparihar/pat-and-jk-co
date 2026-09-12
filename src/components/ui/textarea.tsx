import { cn } from '@/utilities/ui'
import * as React from 'react'

import { fieldClasses } from './input'

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...props
}) => {
  return (
    <textarea className={cn(fieldClasses, 'min-h-36 py-3 leading-relaxed', className)} {...props} />
  )
}

export { Textarea }
