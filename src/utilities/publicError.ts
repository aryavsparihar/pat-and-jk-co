import { APIError } from 'payload'

/**
 * An error whose message is meant for the person who caused it: a form refused, a password too
 * weak. Payload shows such a message only if the error has data or a name, and the production
 * build shortens class names to nothing, so without the data every one of them reached people as
 * "An unknown error occurred." The data is that guarantee; it carries nothing else.
 */
export const publicError = (message: string, status = 400): APIError =>
  new APIError(message, status, { public: true }, true)
