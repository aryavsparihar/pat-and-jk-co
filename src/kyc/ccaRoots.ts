/**
 * India's Controller of Certifying Authorities (CCA) root certificates, PEM-encoded. UIDAI's
 * signing certificate for e-Aadhaar chains up to one of these through a licensed CA.
 *
 * Empty until they are added from cca.gov.in (docs/KYC.md#verification). While empty, the
 * e-Aadhaar check still verifies the signature itself, but cannot confirm the chain, so its
 * result is at best "needs manual review".
 */
export const CCA_ROOTS_PEM: string[] = []
