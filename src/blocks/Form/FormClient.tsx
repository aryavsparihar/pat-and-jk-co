'use client'
import type { Form as FormType } from '@payloadcms/plugin-form-builder/types'
import type { DefaultTypedEditorState } from '@payloadcms/richtext-lexical'

import { useRouter } from 'next/navigation'
import React, { useCallback, useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'

import RichText from '@/components/RichText'
import { BotCheckHelp } from '@/components/turnstile/BotCheckHelp'
import { type BotCheckProblem, useTurnstile } from '@/components/turnstile/useTurnstile'
import { TURNSTILE_FIELD } from '@/security/turnstile'
import { HONEYPOT_FIELD } from '@/utilities/honeypot'

import { fields } from './fields'

type Props = {
  form: FormType
  /** The brand's email address, offered when the bot check cannot run */
  helpEmail?: string | null
}

export const FormClient: React.FC<Props> = ({ form, helpEmail }) => {
  const { id: formID, confirmationMessage, confirmationType, redirect, submitButtonLabel } = form

  const defaultValues = useMemo(() => {
    const values: Record<string, unknown> = { [HONEYPOT_FIELD]: '' }
    for (const field of form.fields ?? []) {
      if ('name' in field && field.name) {
        values[field.name] = 'defaultValue' in field ? (field.defaultValue ?? '') : ''
      }
    }
    return values
  }, [form.fields])

  const formMethods = useForm({ defaultValues })
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = formMethods

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const router = useRouter()
  const { element: botCheck, getToken } = useTurnstile('contact')
  const [botProblem, setBotProblem] = useState<BotCheckProblem | null>(null)

  const onSubmit = useCallback(
    async (data: Record<string, unknown>) => {
      setError(undefined)
      setIsSubmitting(true)

      const submissionData = Object.entries(data).map(([field, value]) => ({
        field,
        value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? ''),
      }))
      // Cloudflare Turnstile, where it is set up; the server drops it before storing anything.
      // Without the check nothing is sent: the person is told why and what to do
      setBotProblem(null)
      const human = await getToken()
      if (human.problem) {
        setIsSubmitting(false)
        setBotProblem(human.problem)
        return
      }
      if (human.token) submissionData.push({ field: TURNSTILE_FIELD, value: human.token })

      try {
        const res = await fetch('/api/form-submissions', {
          body: JSON.stringify({ form: formID, submissionData }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body?.errors?.[0]?.message || 'Something went wrong. Please try again.')
          setIsSubmitting(false)
          return
        }

        setIsSubmitting(false)
        setHasSubmitted(true)

        if (confirmationType === 'redirect' && redirect?.url) {
          router.push(redirect.url)
        }
      } catch {
        setIsSubmitting(false)
        setError('We could not reach the server. Please check your connection and try again.')
      }
    },
    [router, formID, redirect, confirmationType, getToken],
  )

  if (hasSubmitted && confirmationType === 'message') {
    return (
      <div aria-live="polite" className="border-t border-border-strong pt-8" role="status">
        {confirmationMessage ? (
          <RichText data={confirmationMessage as DefaultTypedEditorState} />
        ) : (
          <p className="display-sm">Thank you. We will be in touch soon.</p>
        )}
      </div>
    )
  }

  return (
    <FormProvider {...formMethods}>
      <form id={String(formID)} noValidate onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-wrap gap-x-[4%] gap-y-8">
          {form.fields?.map((field, index) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Field: React.FC<any> = fields?.[field.blockType as keyof typeof fields]
            if (!Field) return null
            const width = 'width' in field && field.width ? Number(field.width) : 100
            return (
              <div
                key={index}
                style={{ flexBasis: width >= 100 ? '100%' : `${width - 2}%` }}
                className="min-w-[14rem] grow"
              >
                <Field
                  form={form}
                  {...field}
                  width={undefined}
                  {...formMethods}
                  control={control}
                  errors={errors}
                  register={register}
                />
              </div>
            )
          })}
        </div>

        {/* Honeypot: invisible to people, tempting to bots */}
        <div aria-hidden className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
          <label htmlFor={HONEYPOT_FIELD}>Company website</label>
          <input
            autoComplete="off"
            id={HONEYPOT_FIELD}
            tabIndex={-1}
            {...register(HONEYPOT_FIELD)}
          />
        </div>

        {botProblem && <BotCheckHelp email={helpEmail} problem={botProblem} />}
        {botCheck}

        {error && (
          <p className="mt-6 text-base italic text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-10">
          <button className="btn btn-solid" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Sending…' : submitButtonLabel || 'Send'}
          </button>
        </div>
      </form>
    </FormProvider>
  )
}
