import type { EmailField } from '@payloadcms/plugin-form-builder/types'
import type { FieldErrorsImpl, FieldValues, UseFormRegister } from 'react-hook-form'

import { Input } from '@/components/ui/input'
import React from 'react'

import { FieldShell } from '../FieldShell'
import { isEmailShaped } from '@/utilities/emailShape'

export const Email: React.FC<
  EmailField & {
    errors: Partial<FieldErrorsImpl>
    register: UseFormRegister<FieldValues>
  }
> = ({ name, defaultValue, errors, label, register, required, width }) => {
  return (
    <FieldShell
      hasError={Boolean(errors[name])}
      label={label}
      name={name}
      required={required}
      width={width}
    >
      <Input
        aria-invalid={Boolean(errors[name])}
        autoComplete="email"
        defaultValue={defaultValue}
        id={name}
        inputMode="email"
        type="email"
        {...register(name, {
          validate: (value: string) =>
            !value || isEmailShaped(value.trim()) || 'Please enter a valid email address',
          required: Boolean(required),
        })}
      />
    </FieldShell>
  )
}
