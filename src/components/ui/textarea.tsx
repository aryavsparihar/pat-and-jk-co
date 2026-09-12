import { cn } from '@/utilities/ui'
import * as React from 'react'

import { fieldClasses } from './input'

const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...props
}) => {
  return (
    <textarea
      className={cn(
        fieldClasses,
        'min-h-32 resize-y bg-surface/50 px-3 py-2 leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
