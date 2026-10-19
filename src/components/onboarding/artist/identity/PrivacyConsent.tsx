'use client'

import React from 'react'

import { AGREE_PHRASE, ReadToAgree } from './ReadToAgree'

export { AGREE_PHRASE }

/**
 * Consent to identity details being processed, given in so many words: the privacy policy read
 * to its end in a dialog, confirmed, and I AGREE typed (ReadToAgree). The server records when,
 * against which version of the notice, and how.
 */
export const PrivacyConsent: React.FC<{
  agreed: boolean
  onAgreed: (agreed: boolean) => void
  privacy: React.ReactNode
  error?: string
}> = ({ agreed, onAgreed, privacy, error }) => (
  <ReadToAgree
    agreed={agreed}
    body={privacy}
    documentName="the privacy policy"
    error={error}
    id="consent"
    label={
      <>
        I agree to PAT and J.K. Co. processing my identity details, including the photo of my face,
        to confirm who I am, as the{' '}
        <a className="link" href="/privacy" rel="noopener noreferrer" target="_blank">
          privacy policy
        </a>{' '}
        describes.
      </>
    }
    onAgreed={onAgreed}
    title="Privacy policy"
  />
)
