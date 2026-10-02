import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { execute } from '@/utilities/sql'

import { OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from './constants'
import { createOtp, hashOtp, otpMatches } from './otp'

/**
 * One-time codes, issued and checked in one place for staff (the admin gate) and members.
 *
 *   - six digits from a cryptographic source, valid for ten minutes, usable once
 *   - stored only as a keyed hash, salted with the challenge's own id
 *   - compared in constant time
 *   - five attempts per code, enforced in the database: an attempt is reserved with a single
 *     atomic UPDATE *before* the code is compared, so a hundred guesses fired at once still get
 *     five comparisons between them, not a hundred
 *   - spent with a second atomic UPDATE, so two correct submissions at once cannot both succeed
 *
 * A challenge is created even when no code will be sent (`deliverable: false`), so the caller
 * can answer every request the same way and nobody can tell which addresses exist.
 */

export type Audience = 'staff' | 'member'
export type Purpose = 'signin' | 'apply-artist' | 'apply-partner' | 'step-up'

export const issueChallenge = async (
  payload: Payload,
  {
    email,
    ip,
    audience,
    purpose,
    deliverable,
  }: { email: string; ip: string; audience: Audience; purpose?: Purpose; deliverable: boolean },
): Promise<{ id: number; code: string }> => {
  const code = createOtp()
  const challenge = await payload.create({
    collection: 'login-challenges',
    data: {
      email,
      codeHash: 'pending',
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString(),
      attempts: 0,
      ip,
      deliverable,
      audience,
      purpose,
    },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

  // The challenge id salts the hash, so two codes are never stored the same way
  await payload.update({
    collection: 'login-challenges',
    id: challenge.id,
    data: { codeHash: hashOtp(code, String(challenge.id)) },
    overrideAccess: true,
    context: { disableRevalidate: true },
  })

  return { id: challenge.id, code }
}

export type ChallengeFailure = 'missing' | 'expired' | 'spent' | 'too-many-attempts' | 'wrong-code'

export type ChallengeResult =
  | { ok: true; id: number; email: string; purpose: Purpose | null }
  | { ok: false; reason: ChallengeFailure; email?: string }

type Row = {
  id: number
  email: string
  code_hash: string | null
  expires_at: string | Date
  deliverable: boolean | null
  purpose: Purpose | null
}

/** Checks a code. A wrong or late code costs an attempt; a right one spends the challenge. */
export const checkChallenge = async (
  payload: Payload,
  { challengeId, code, audience }: { challengeId: unknown; code: unknown; audience: Audience },
): Promise<ChallengeResult> => {
  const id = Number(challengeId)
  const digits = String(code ?? '').replace(/\D/g, '')
  if (!Number.isSafeInteger(id) || id <= 0 || digits.length === 0) {
    return { ok: false, reason: 'missing' }
  }

  // Reserve one attempt, atomically, before looking at the code at all
  const [row] = await execute<Row>(
    payload,
    sql`
      UPDATE login_challenges
      SET attempts = attempts + 1, updated_at = now()
      WHERE id = ${id}
        AND audience = ${audience}
        AND consumed_at IS NULL
        AND attempts < ${OTP_MAX_ATTEMPTS}
      RETURNING id, email, code_hash, expires_at, deliverable, purpose
    `,
  )

  if (!row) {
    // Say why, for the security log only; the caller answers every failure the same way
    const [existing] = await execute<{ email: string; audience: string; consumed_at: unknown }>(
      payload,
      sql`SELECT email, audience, consumed_at FROM login_challenges WHERE id = ${id}`,
    )
    if (!existing || existing.audience !== audience) return { ok: false, reason: 'missing' }
    return {
      ok: false,
      reason: existing.consumed_at ? 'spent' : 'too-many-attempts',
      email: existing.email,
    }
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', email: row.email }
  }

  const good = Boolean(row.deliverable) && otpMatches(digits, String(row.id), row.code_hash ?? '')
  if (!good) return { ok: false, reason: 'wrong-code', email: row.email }

  const [spent] = await execute<{ id: number }>(
    payload,
    sql`
      UPDATE login_challenges SET consumed_at = now(), updated_at = now()
      WHERE id = ${id} AND consumed_at IS NULL
      RETURNING id
    `,
  )
  if (!spent) return { ok: false, reason: 'spent', email: row.email }

  return { ok: true, id: row.id, email: row.email, purpose: row.purpose }
}

/** Whose challenge this is, without spending an attempt: lets a locked address be refused first. */
export const challengeEmail = async (
  payload: Payload,
  { challengeId, audience }: { challengeId: unknown; audience: Audience },
): Promise<string | null> => {
  const id = Number(challengeId)
  if (!Number.isSafeInteger(id) || id <= 0) return null
  const [row] = await execute<{ email: string }>(
    payload,
    sql`SELECT email FROM login_challenges WHERE id = ${id} AND audience = ${audience}`,
  )
  return row?.email ?? null
}
