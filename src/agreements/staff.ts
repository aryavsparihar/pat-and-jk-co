import 'server-only'

import type { PayloadRequest } from 'payload'

import { isKycReviewer } from '@/access/roles'
import { KycError, openKycDocument, storeKycDocument } from '@/kyc/service'
import type { AgreementExecution, Member } from '@/payload-types'
import { refuse } from '@/security/refused'

import { AGREEMENTS } from './documents'
import { sendExecutedAgreement } from './emails'

/**
 * The admin's side of a signed agreement: download the signed PDF (or the live photo, or the
 * countersigned copy), with a reason, logged as any KYC document is; and upload the copy
 * countersigned with PAT & J.K. Co.'s DSC, which locks the record and sends it to the signer and
 * to compliance. KYC reviewers only.
 */

const FILES = {
  signed: 'signedPdf',
  countersigned: 'countersignedPdf',
  photo: 'photo',
} as const

const idOf = (value: unknown) =>
  typeof value === 'object' && value ? (value as { id: number }).id : (value as number | null)

const findExecution = (req: PayloadRequest) =>
  req.payload.findByID({
    collection: 'agreement-executions',
    id: Number(req.routeParams?.id),
    depth: 0,
    overrideAccess: true,
  }) as Promise<AgreementExecution>

const fail = (req: PayloadRequest, error: unknown, what: string) => {
  if (error instanceof KycError)
    return Response.json({ message: error.message }, { status: error.status })
  req.payload.logger.error({ err: error, msg: what })
  return Response.json({ message: `${what}.` }, { status: 500 })
}

export const downloadAgreementFile = async (req: PayloadRequest): Promise<Response> => {
  if (!isKycReviewer(req.user)) return refuse(req, 'Not allowed.')
  const body = (await req.json?.().catch(() => ({}))) as { file?: string; reason?: string }
  const field = FILES[body?.file as keyof typeof FILES]
  if (!field) return Response.json({ message: 'Which file?' }, { status: 400 })
  try {
    const execution = await findExecution(req)
    const documentId = idOf(execution[field])
    if (!documentId)
      return Response.json({ message: 'There is no such file yet.' }, { status: 404 })
    const file = await openKycDocument(req.payload, {
      documentId,
      actor: req.user!,
      reason: body.reason,
    })
    const slug = AGREEMENTS[execution.kind].slug
    const extension = file.contentType === 'application/pdf' ? 'pdf' : 'jpg'
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${execution.memberCode}-${slug}-${body.file}.${extension}"`,
        'Content-Length': String(file.bytes.length),
        'Cache-Control': 'no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (error) {
    return fail(req, error, 'The file could not be opened')
  }
}

export const uploadCountersigned = async (req: PayloadRequest): Promise<Response> => {
  if (!isKycReviewer(req.user)) return refuse(req, 'Not allowed.')
  try {
    const execution = await findExecution(req)
    if (execution.state !== 'pending-countersignature') {
      return Response.json(
        {
          message:
            execution.state === 'executed'
              ? 'This agreement is already countersigned and sent. It cannot be replaced.'
              : 'This agreement has not been signed yet.',
        },
        { status: 409 },
      )
    }
    const form = await req.formData?.()
    const file = form?.get('file')
    if (!(file instanceof Blob)) {
      return Response.json({ message: 'Please choose the countersigned PDF.' }, { status: 400 })
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return Response.json({ message: 'Please upload the countersigned PDF.' }, { status: 400 })
    }
    const member = (await req.payload.findByID({
      collection: 'members',
      id: idOf(execution.member)!,
      depth: 0,
      overrideAccess: true,
    })) as Member
    const document = await storeKycDocument(req.payload, {
      member,
      kind: 'agreement-countersigned',
      bytes,
    })
    const now = new Date().toISOString()
    // Locked from here: the state no longer allows another upload
    const locked = (await req.payload.update({
      collection: 'agreement-executions',
      id: execution.id,
      data: {
        state: 'executed',
        countersignedPdf: document.id,
        countersignedPdfSha256: document.sha256,
        countersignedAt: now,
        countersignedBy: req.user!.id,
      } as never,
      overrideAccess: true,
      context: { disableRevalidate: true },
    })) as AgreementExecution
    const agreement = AGREEMENTS[execution.kind]
    const sent = await sendExecutedAgreement(req.payload, {
      execution: locked,
      agreement,
      pdf: bytes,
      filename: `${execution.memberCode}-${agreement.slug}-executed.pdf`,
    }).catch((error) => {
      req.payload.logger.error({ err: error, msg: 'Could not send the executed agreement' })
      return false
    })
    if (sent) {
      await req.payload.update({
        collection: 'agreement-executions',
        id: execution.id,
        data: { sentAt: new Date().toISOString() } as never,
        overrideAccess: true,
        context: { disableRevalidate: true },
      })
    }
    return Response.json({
      message: sent
        ? `Countersigned copy kept and sent to ${execution.signer?.email} and compliance.`
        : 'Countersigned copy kept, but the email could not be sent. Please send it by hand.',
      sent,
    })
  } catch (error) {
    return fail(req, error, 'The countersigned copy could not be saved')
  }
}
