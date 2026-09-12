import type { CheckboxField } from '@payloadcms/plugin-form-builder/types'
import type { FieldErrorsImpl, FieldValues, UseFormRegister } from 'react-hook-form'

import React from 'react'

import { Error } from '../Error'
import { Width } from '../Width'

export const Checkbox: React.FC<
  CheckboxField & {
    errors: Partial<FieldErrorsImpl>
    register: UseFormRegister<FieldValues>
  }
> = ({ name, defaultValue, errors, label, register, required, width }) => {
  return (
    <Width width={width}>
      <label
        className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed"
        htmlFor={name}
      >
        <input
          className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
          defaultChecked={Boolean(defaultValue)}
          id={name}
          type="checkbox"
          {...register(name, { required: Boolean(required) })}
        />
        <span>
          {label}
          {required && (
            <span aria-hidden className="ml-1 text-primary">
              *
            </span>
          )}
        </span>
      </label>
      {errors[name] && <Error name={name} />}
    </Width>
  )
}
