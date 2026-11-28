// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { checkContact } from '@/contact/message'
import { allowedName, safeFileName, sniffFile } from '@/contact/rules'
import { TOPIC_GROUPS, topicFor, topicTitle } from '@/contact/topics'

/*
 * The contact form of the founder's brief (25 November 2026, sections 8, 11 and 12): four groups
 * of subjects, each sent to the right inbox, up to three files of 10 MB in PDF, JPG, PNG or Word,
 * and his wording when something is wrong.
 */

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)])

describe('the subjects', () => {
  it('come in the four groups of the design, in its order', () => {
    expect(TOPIC_GROUPS.map((g) => g.label)).toEqual([
      'PAT & J.K. Co.',
      'Phulhaar Gallery',
      'Curatorial support',
      'Help',
    ])
    expect(TOPIC_GROUPS.flatMap((g) => g.topics)).toHaveLength(15)
  })

  it('send privacy to compliance@, accounts and the website to tech@, the rest to business@', () => {
    expect(topicFor('privacy')?.inbox).toBe('compliance')
    expect(topicFor('account')?.inbox).toBe('tech')
    expect(topicFor('website')?.inbox).toBe('tech')
    for (const value of ['general', 'commission', 'trade-account', 'curatorial-set', 'press'])
      expect(topicFor(value)?.inbox, value).toBe('business')
  })

  it('answer to the links other pages use, and to nothing else', () => {
    expect(topicFor('working-for-pjk')?.label).toBe('Working for PJK')
    expect(topicFor('curatorial-collection')?.label).toBe('For a collection or an event')
    expect(topicFor('nonsense')).toBeUndefined()
    expect(topicTitle('commission')).toBe('Phulhaar Gallery: Commissioning a work')
  })
})

describe('files', () => {
  it('are known by their first bytes, never by their name alone', () => {
    expect(sniffFile(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), 'cv.pdf')?.type).toBe('application/pdf')
    expect(sniffFile(bytes(0xff, 0xd8, 0xff), 'photo.jpeg')?.ext).toBe('jpg')
    expect(sniffFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'a.png')?.ext).toBe(
      'png',
    )
    expect(sniffFile(bytes(0x50, 0x4b, 0x03, 0x04), 'brief.docx')?.ext).toBe('docx')
    expect(sniffFile(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), 'old.doc')?.ext).toBe(
      'doc',
    )
    // A ZIP that is not called a Word file, and a program called a PDF, are refused
    expect(sniffFile(bytes(0x50, 0x4b, 0x03, 0x04), 'archive.zip')).toBeNull()
    expect(sniffFile(bytes(0x4d, 0x5a), 'invoice.pdf')).toBeNull()
  })

  it('keep a safe name with their true extension', () => {
    expect(safeFileName('C:\\Users\\me\\My "CV".PDF', 'pdf', 0)).toBe('My CV.pdf')
    expect(safeFileName('', 'png', 2)).toBe('attachment-3.png')
    expect(allowedName('portfolio.JPG')).toBe(true)
    expect(allowedName('notes.txt')).toBe(false)
  })
})

describe('a message', () => {
  const good = {
    name: 'Asha Example',
    email: 'Asha@Example.com',
    about: 'commission',
    message: 'A painting for a hall.\r\n\r\n\r\nAbout two metres wide.',
    files: [{ name: 'room.jpg', size: 2_000_000 }],
  }

  it('is accepted, tidied, with its files promised', () => {
    const checked = checkContact(good)
    expect(checked.ok).toBe(true)
    if (!checked.ok) return
    expect(checked.input.email).toBe('asha@example.com')
    expect(checked.input.message).toBe('A painting for a hall.\n\nAbout two metres wide.')
    expect(checked.input.files).toEqual([{ name: 'room.jpg', size: 2_000_000 }])
  })

  it('says what is missing in the founder’s words', () => {
    const checked = checkContact({})
    expect(checked.ok).toBe(false)
    if (checked.ok) return
    expect(checked.errors).toEqual({
      name: 'Please fill in “Name”.',
      email: 'Please fill in “Email”.',
      about: 'Please choose what you are writing about.',
      message: 'Please fill in “Message”.',
    })
  })

  it('refuses a broken address, a wrong file, a large one, and a fourth', () => {
    const errorsFor = (change: object) => {
      const checked = checkContact({ ...good, ...change })
      return checked.ok ? {} : checked.errors
    }
    expect(errorsFor({ email: 'asha@' }).email).toBe(
      'Please enter a full email address, for example name@example.com.',
    )
    expect(errorsFor({ files: [{ name: 'setup.exe', size: 10 }] }).files).toBe(
      '“setup.exe” is not a PDF, JPG, PNG or Word file.',
    )
    expect(errorsFor({ files: [{ name: 'big.pdf', size: 11 * 1024 * 1024 }] }).files).toBe(
      '“big.pdf” is larger than 10 MB. Please send a smaller copy.',
    )
    const four = Array.from({ length: 4 }, (_, i) => ({ name: `${i}.pdf`, size: 10 }))
    expect(errorsFor({ files: four }).files).toBe('You can attach up to three files.')
  })
})
