#!/usr/bin/env node
/**
 * Turns arbitrary photographs into a matching set of head-and-collar portraits:
 * the subject is cut out (Apple Vision, via portrait-cutout.swift), framed so every face
 * sits at the same size and height, and placed on the site's paper tone.
 *
 *   node scripts/brand/make-portraits.mjs <out-dir> <name>=<photo> [<name>=<photo> …]
 *
 * Example:
 *   node scripts/brand/make-portraits.mjs public/brand/people \
 *     yuvraj=~/Downloads/yuvraj.jpg aryaveer=~/Downloads/aryaveer.jpeg
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

// Framing, as fractions of the output frame
const OUT_WIDTH = 900
const OUT_HEIGHT = 1125 // 4:5
const MIN_FACE_HEIGHT = 0.34 // smallest share of the frame the face may occupy
const FACE_CENTRE_Y = 0.42 // where the middle of the face sits
const BACKGROUND = '#eeeadf' // the site's paper tone

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('usage: make-portraits.mjs <out-dir> <name>=<photo> […]')
  process.exit(1)
}

const [outDir, ...inputs] = args
mkdirSync(outDir, { recursive: true })
const work = mkdtempSync(path.join(tmpdir(), 'portraits-'))

// 1. Cut every subject out, and note how big each face is in its own photograph
const subjects = []
for (const input of inputs) {
  const [name, rawPath] = input.split('=')
  const source = rawPath.replace(/^~/, process.env.HOME)
  const cutout = path.join(work, `${name}.png`)

  const stdout = execFileSync(
    'swift',
    [path.join('scripts', 'brand', 'portrait-cutout.swift'), source, cutout],
    { encoding: 'utf8' },
  )
  const info = JSON.parse(stdout.trim().split('\n').pop())
  const meta = await sharp(cutout).metadata()
  const face = info.face ?? {
    x: meta.width * 0.3,
    y: meta.height * 0.15,
    width: meta.width * 0.4,
    height: meta.height * 0.4,
  }
  subjects.push({ name, cutout, meta, face })
}

/**
 * 2. Pick one framing for the whole set. A photograph that stops at the chest can only be
 * cropped so far before it runs out of image, so the tightest photograph decides the face
 * size for everyone — that way the portraits match and none needs padding.
 */
const faceHeight = subjects.reduce((largest, { meta, face }) => {
  const neededForHeight = face.height / meta.height
  const neededForWidth = (OUT_WIDTH / OUT_HEIGHT) * (face.height / meta.width)
  return Math.max(largest, neededForHeight * 1.02, neededForWidth * 1.02)
}, MIN_FACE_HEIGHT)

// 3. Crop, place on paper and grade identically
for (const { name, cutout, meta, face } of subjects) {
  const cropHeight = Math.round(face.height / faceHeight)
  const cropWidth = Math.round((OUT_WIDTH / OUT_HEIGHT) * cropHeight)
  const faceCentreX = face.x + face.width / 2
  const faceCentreY = face.y + face.height / 2

  const clamp = (value, max) => Math.max(0, Math.min(Math.round(value), Math.max(0, max)))
  const left = clamp(faceCentreX - cropWidth / 2, meta.width - cropWidth)
  const top = clamp(faceCentreY - FACE_CENTRE_Y * cropHeight, meta.height - cropHeight)

  const output = path.join(outDir, `${name}.jpg`)
  await sharp(cutout)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit: 'fill' })
    .flatten({ background: BACKGROUND })
    // A light, consistent grade so portraits from different cameras sit together
    .modulate({ saturation: 0.88, brightness: 1.02 })
    .linear(1.04, -6)
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toFile(output)

  console.log(`${output}  (crop ${cropWidth}×${cropHeight} of ${meta.width}×${meta.height})`)
}

rmSync(work, { recursive: true, force: true })
