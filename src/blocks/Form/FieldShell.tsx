import React from 'react'

import { Error } from './Error'
import { Width } from './Width'

type Props = {
  children: React.ReactNode
  hasError?: boolean
  label?: string | null
  name: string
  required?: boolean | null
  width?: number | string | null
}

/** Label, field and error message — shared by every form field type. */
export const FieldShell: React.FC<Props> = ({
  children,
  hasError,
  label,
  name,
  required,
  width,
}) => (
  <Width width={width ?? undefined}>
    {label && (
      <label className="label mb-1 block" htmlFor={name}>
        {label}
        {required && (
          <span aria-hidden className="ml-1 text-primary">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
    )}
    {children}
    {hasError && <Error name={name} />}
  </Width>
)
