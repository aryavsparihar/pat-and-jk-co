/**
 * How the masked e-Aadhaar check (src/kyc/aadhaarCheck.ts) is used.
 *
 *   advisory    the result is recorded for staff; the application goes ahead whatever it says
 *   enforcing   a result of "not verified" stops the KYC step from saving, with the reason
 *
 * Advisory until the check has been confirmed on real uploads (docs/KYC.md#verification).
 */
export const AADHAAR_CHECK_MODE: 'advisory' | 'enforcing' = 'advisory'
