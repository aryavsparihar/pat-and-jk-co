import type { TextField } from '@payloadcms/plugin-form-builder/types'
import type { FieldErrorsImpl, FieldValues, UseFormRegister } from 'react-hook-form'

import { Textarea as TextAreaComponent } from '@/components/ui/textarea'
import React from 'react'

import { FieldShell } from '../FieldShell'

export const Textarea: React.FC<
  TextField & {
    errors: Partial<FieldErrorsImpl>
    register: UseFormRegister<FieldValues>
    rows?: number
  }
> = ({ name, defaultValue, errors, label, register, required, rows = 5, width }) => {
  return (
    <FieldShell
      hasError={Boolean(errors[name])}
      label={label}
      name={name}
      required={required}
      width={width}
    >
      <TextAreaComponent
        aria-invalid={Boolean(errors[name])}
        defaultValue={defaultValue}
        id={name}
        rows={rows}
        {...register(name, { required: Boolean(required) })}
      />
    </FieldShell>
  )
}
