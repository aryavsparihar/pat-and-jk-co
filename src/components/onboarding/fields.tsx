'use client'

import { cn } from '@/utilities/ui'
import React, { useEffect, useRef } from 'react'

/**
 * Form parts for the onboarding: labelled, described and accessible. Every input has a real
 * label; hints and errors are tied to it with aria-describedby; an invalid field says so with
 * aria-invalid. Touch targets are at least 44 px tall.
 */

export type Errors = Record<string, string>

export const fieldClass =
  'w-full min-h-11 rounded-none border-0 border-b border-input bg-transparent px-0 py-2 text-[1.15rem] text-[var(--text)] transition-colors placeholder:text-muted-foreground/70 hover:border-primary focus:border-primary focus:outline-none focus:shadow-[0_1px_0_0_var(--primary)] aria-invalid:border-destructive'

export const idFor = (name: string) => `field-${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`

type FieldProps = {
  name: string
  label: string
  hint?: string
  error?: string
  optional?: boolean
  className?: string
  children: (props: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: true
  }) => React.ReactNode
}

export const Field: React.FC<FieldProps> = ({
  name,
  label,
  hint,
  error,
  optional,
  className,
  children,
}) => {
  const id = idFor(name)
  const described =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('min-w-0', className)}>
      <label className="label mb-1 block" htmlFor={id}>
        {label}
        {optional && (
          <span className="ml-2 normal-case tracking-normal text-muted-foreground">(optional)</span>
        )}
      </label>
      {hint && (
        <p className="muted mb-2 text-base" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children({ id, 'aria-describedby': described, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p className="mt-2 text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'name' | 'onChange' | 'value'
> & {
  name: string
  label: string
  hint?: string
  errors: Errors
  optional?: boolean
  value: string | number | undefined | null
  onValue: (value: string) => void
}

export const TextField: React.FC<InputProps> = ({
  name,
  label,
  hint,
  errors,
  optional,
  value,
  onValue,
  className,
  ...rest
}) => (
  <Field
    className={className}
    error={errors[name]}
    hint={hint}
    label={label}
    name={name}
    optional={optional}
  >
    {(a11y) => (
      <input
        {...rest}
        {...a11y}
        className={fieldClass}
        name={name}
        onChange={(e) => onValue(e.target.value)}
        required={!optional}
        value={value ?? ''}
      />
    )}
  </Field>
)

type AreaProps = Omit<InputProps, 'type'> & {
  rows?: number
  limit?: number
  /** The shortest it may be; the count below says how close they are */
  min?: number
}

export const TextArea: React.FC<AreaProps> = ({
  name,
  label,
  hint,
  errors,
  optional,
  value,
  onValue,
  rows = 4,
  limit,
  min,
  className,
}) => {
  // Counted as the server counts: without the spaces at either end
  const length = String(value ?? '').trim().length
  const short = min !== undefined && length < min
  return (
    <Field
      className={className}
      error={errors[name]}
      hint={hint}
      label={label}
      name={name}
      optional={optional}
    >
      {(a11y) => (
        <>
          <textarea
            {...a11y}
            className={cn(fieldClass, 'resize-y leading-relaxed')}
            maxLength={limit}
            name={name}
            onChange={(e) => onValue(e.target.value)}
            required={!optional}
            rows={rows}
            value={value ?? ''}
          />
          {limit && (
            <p
              aria-hidden
              className={cn(
                'muted mt-1 text-right text-sm tabular-nums transition-colors',
                (length > limit * 0.9 || (min !== undefined && !short)) && 'text-primary',
              )}
            >
              {short ? `${length} of at least ${min}` : `${length} of ${limit}`}
            </p>
          )}
          {/* Said once, when it changes, not on every key */}
          <p aria-live="polite" className="sr-only">
            {min !== undefined && !short ? 'That is long enough.' : ''}
            {limit && length > limit * 0.9 ? ` ${limit - length} characters left.` : ''}
          </p>
        </>
      )}
    </Field>
  )
}

type SelectProps = {
  name: string
  label: string
  hint?: string
  errors: Errors
  optional?: boolean
  value: string | undefined | null
  onValue: (value: string) => void
  options: readonly (string | { value: string; label: string })[]
  placeholder?: string
  className?: string
}

export const SelectField: React.FC<SelectProps> = ({
  name,
  label,
  hint,
  errors,
  optional,
  value,
  onValue,
  options,
  placeholder = 'Please choose…',
  className,
}) => (
  <Field
    className={className}
    error={errors[name]}
    hint={hint}
    label={label}
    name={name}
    optional={optional}
  >
    {(a11y) => (
      <select
        {...a11y}
        className={cn(fieldClass, 'cursor-pointer')}
        name={name}
        onChange={(e) => onValue(e.target.value)}
        required={!optional}
        value={value ?? ''}
      >
        <option disabled={!optional} value="">
          {placeholder}
        </option>
        {options.map((o) => {
          const option = typeof o === 'string' ? { value: o, label: o } : o
          return (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          )
        })}
      </select>
    )}
  </Field>
)

/** A labelled checkbox with its whole row clickable, at least 44 px tall */
export const Check: React.FC<{
  name: string
  label: React.ReactNode
  checked: boolean
  onValue: (checked: boolean) => void
  error?: string
}> = ({ name, label, checked, onValue, error }) => {
  const id = idFor(name)
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-start gap-4 py-2" htmlFor={id}>
        <input
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          checked={checked}
          className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--primary)]"
          id={id}
          name={name}
          onChange={(e) => onValue(e.target.checked)}
          type="checkbox"
        />
        <span className="measure">{label}</span>
      </label>
      {error && (
        <p className="ml-9 text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

/** Several choices at once, e.g. mediums, as a fieldset of checkboxes */
export const CheckGroup: React.FC<{
  name: string
  legend: string
  hint?: string
  options: readonly { value: string; label: string }[]
  value: string[]
  onValue: (value: string[]) => void
  error?: string
}> = ({ name, legend, hint, options, value, onValue, error }) => {
  const id = idFor(name)
  return (
    <fieldset
      aria-describedby={
        [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
      }
    >
      <legend className="label mb-1">{legend}</legend>
      {hint && (
        <p className="muted mb-2 text-base" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => (
          <label className="flex min-h-11 cursor-pointer items-center gap-3" key={o.value}>
            <input
              checked={value.includes(o.value)}
              className="size-5 cursor-pointer accent-[var(--primary)]"
              id={`${id}-${o.value}`}
              onChange={(e) =>
                onValue(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))
              }
              type="checkbox"
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-base italic text-destructive" id={`${id}-error`}>
          {error}
        </p>
      )}
    </fieldset>
  )
}

/**
 * The errors from a failed save, listed at the top of the step and read out by screen readers.
 * It takes focus when it appears, and each item links to its field.
 */
export const ErrorSummary: React.FC<{ errors: Errors; labels?: Record<string, string> }> = ({
  errors,
  labels = {},
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const entries = Object.entries(errors)
  useEffect(() => {
    if (entries.length > 0) ref.current?.focus()
  }, [entries.length])
  if (entries.length === 0) return null
  return (
    <div
      className="mb-10 border-l-2 border-destructive bg-surface py-5 pl-6 pr-4"
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      <p className="font-medium">A few things need another look</p>
      <ul className="mt-3 space-y-1">
        {entries.map(([key, message]) => (
          <li key={key}>
            <a className="link" href={`#${idFor(key)}`}>
              {labels[key] ? `${labels[key]}: ` : ''}
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
