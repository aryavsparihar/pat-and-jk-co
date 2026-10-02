import type { Access } from 'payload'

import { isStaff } from './roles'

/** Staff see drafts; everyone else, members included, sees published documents only. */
export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (isStaff(user)) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
