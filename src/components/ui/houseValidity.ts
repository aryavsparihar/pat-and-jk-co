import type { FormEvent } from 'react'

/**
 * The browser's own messages for a required or mistyped field ("Please fill out this field.")
 * differ from browser to browser and are not in the house voice. The founder's error document
 * (25 November 2026, section 9) asks for its own lines instead, set with setCustomValidity. Spread
 * these handlers onto a <form> that lets the browser check it:
 *
 *   <form {...houseValidity} onSubmit={…}>
 *
 * A field may carry its own line in data-missing ("Please enter your full name."); otherwise the
 * document's general lines are used. Any change to the form clears them, so a corrected field is
 * never held back by its old message.
 */
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

export const HOUSE_VALIDITY = {
  missing: 'Please fill this in.',
  choose: 'Please choose one.',
  email: 'Please enter a full email address, for example name@example.com.',
  url: 'Please give the full web address, starting https:// (for example, https://example.com).',
  tooLong: (max: number) => `Please keep this to ${max} characters or fewer.`,
} as const

const lineFor = (field: Field): string => {
  const v = field.validity
  if (v.valueMissing)
    return (
      field.dataset.missing ??
      (field instanceof HTMLSelectElement || (field as HTMLInputElement).type === 'radio'
        ? HOUSE_VALIDITY.choose
        : HOUSE_VALIDITY.missing)
    )
  if (v.typeMismatch && (field as HTMLInputElement).type === 'email') return HOUSE_VALIDITY.email
  if (v.typeMismatch && (field as HTMLInputElement).type === 'url') return HOUSE_VALIDITY.url
  if (v.tooLong && 'maxLength' in field) return HOUSE_VALIDITY.tooLong(field.maxLength)
  return ''
}

const isField = (target: EventTarget | null): target is Field =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement

const clearAll = (event: FormEvent<HTMLFormElement>) => {
  for (const element of Array.from(event.currentTarget.elements))
    if (isField(element) && element.validity.customError) element.setCustomValidity('')
}

export const houseValidity = {
  onInvalidCapture: (event: FormEvent<HTMLFormElement>) => {
    if (!isField(event.target)) return
    // Measured without our own line, then given the house one
    event.target.setCustomValidity('')
    event.target.setCustomValidity(lineFor(event.target))
  },
  onInputCapture: clearAll,
  onChangeCapture: clearAll,
}
