import { PortalError, saveContact } from '@/members/profile'
import { contactSchema } from '@/members/forms/portal'
import { parseBody, portalHandler } from '@/members/portalHttp'

export const dynamic = 'force-dynamic'

/** Contact details change at once, for approved artists and partners alike */
export const POST = portalHandler(
  'contact',
  async ({ payload, member, request }) => {
    if (!member.artistId && !member.partnerId) {
      throw new PortalError('Contact details can be changed once you are approved.', 403)
    }
    return { contact: await saveContact(payload, member, await parseBody(request, contactSchema)) }
  },
  { limit: 30 },
)
