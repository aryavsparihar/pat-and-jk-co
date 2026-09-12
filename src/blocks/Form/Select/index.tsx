import type { SelectField } from '@payloadcms/plugin-form-builder/types'
import type { FieldErrorsImpl, FieldValues, UseFormRegister } from 'react-hook-form'

import { fieldClasses } from '@/components/ui/input'
import { cn } from '@/utilities/ui'
import React from 'react'

import { FieldShell } from '../FieldShell'

export const Select: React.FC<
  SelectField & {
    errors: Partial<FieldErrorsImpl>
    register: UseFormRegister<FieldValues>
  }
> = ({ name, defaultValue, errors, label, options, register, required, width }) => {
  return (
    <FieldShell
      hasError={Boolean(errors[name])}
      label={label}
      name={name}
      required={required}
      width={width}
    >
      <div className="relative">
        <select
          aria-invalid={Boolean(errors[name])}
          className={cn(fieldClasses, 'h-11 cursor-pointer appearance-none pr-8')}
          defaultValue={defaultValue ?? ''}
          id={name}
          {...register(name, { required: Boolean(required) })}
        >
          <option disabled value="">
            Please choose…
          </option>
          {options?.map(({ label: optionLabel, value }) => (
            <option key={value} value={value}>
              {optionLabel}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          className="pointer-events-none absolute right-1 top-1/2 size-3 -translate-y-1/2 text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          viewBox="0 0 12 12"
        >
          <path d="M2 4.5 6 8l4-3.5" />
        </svg>
      </div>
    </FieldShell>
  )
}
