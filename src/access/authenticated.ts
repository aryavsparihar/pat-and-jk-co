import type { PayloadRequest } from 'payload'

import { isStaff } from './roles'

/** Signed in as staff. A signed-in member is not enough. */
export const authenticated = ({ req: { user } }: { req: PayloadRequest }): boolean =>
  isStaff(user)
