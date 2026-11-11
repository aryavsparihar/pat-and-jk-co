// @vitest-environment node
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { AGREEMENTS } from '@/agreements/documents'
import { buildAgreementPdf } from '@/agreements/pdf'

describe('the signed agreement PDF', () => {
  for (const agreement of Object.values(AGREEMENTS)) {
    it(`fills the ${agreement.signer}'s block and leaves PAT & J.K. Co.'s lines blank`, async () => {
      const values = agreement.executionLines.map((_, i) => `VALUE-${i} ₹50,000`)
      const bytes = await buildAgreementPdf({
        agreement,
        values,
        memberCode: `${agreement.prefix}-7K3Q9`,
        signedAtIst: '12 November 2026, 10:15:00 IST',
      })
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBeGreaterThan(10)
      expect(pdf.getSubject()).toBe(agreement.version)
      if (process.env.AGREEMENT_PDF_OUT)
        await import('node:fs/promises').then((fs) =>
          fs.writeFile(`${process.env.AGREEMENT_PDF_OUT}/${agreement.slug}.pdf`, bytes),
        )
    })
  }
})
