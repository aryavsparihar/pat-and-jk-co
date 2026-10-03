import { APIError, formatErrors } from 'payload'
import { describe, expect, it } from 'vitest'

import { publicError } from '@/utilities/publicError'

/*
 * The production build shortens class names to nothing, and Payload then answered every refusal
 * meant for people ("Please fill in Name", "Too many messages") with "An unknown error occurred."
 * Here the shortening is done by hand.
 */
const asBuilt = <T extends Error>(error: T): T => {
  error.name = ''
  return error
}

describe('messages meant for people', () => {
  it('reach them after the production build', () => {
    expect(formatErrors(asBuilt(publicError('Please fill in “Name”.'))).errors[0]?.message).toBe(
      'Please fill in “Name”.',
    )
  })

  it('which is what went wrong before', () => {
    const before = asBuilt(new APIError('Please fill in “Name”.', 400, undefined, true))
    expect(formatErrors(before as never).errors[0]?.message).toBe('An unknown error occurred.')
  })

  it('keep their status', () => {
    expect(publicError('Too many messages.', 429).status).toBe(429)
    expect(publicError('Refused.').status).toBe(400)
  })
})
