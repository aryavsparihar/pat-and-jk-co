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
// Square, because the site shows these portraits inside a circle: the corners are never seen,
// so the head sits high and centred and the collar falls away at the bottom of the disc.
const OUT_WIDTH = 900
const OUT_HEIGHT = 900 // 1:1
// The whole head — hair included — decides the framing, so nobody's hair gets clipped
const HEAD_HEIGHT = 0.56 // how much of the frame the head fills, crown to chin
const HEADROOM = 0.15 // clear space above the crown
const BACKGROUND = '#eeeadf' // the site's paper tone

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('usage: make-portraits.mjs <out-dir> <name>=<photo> […]')
  process.exit(1)
}

/**
 * Finds the top of the head in a cut-out: the first row with a meaningful run of opaque
 * pixels, ignoring the odd stray speck left by the mask.
 */
const findCrown = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels
  for (let y = 0; y < info.height; y++) {
    let opaque = 0
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * channels + (channels - 1)] > 128) opaque++
    }
    if (opaque >= Math.max(6, info.width * 0.01)) return y
  }
  return 0
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
  const crown = await findCrown(cutout)
  const face = info.face ?? {
    x: meta.width * 0.3,
    y: meta.height * 0.15,
    width: meta.width * 0.4,
    height: meta.height * 0.4,
  }
  subjects.push({ name, cutout, meta, face, crown })
}

/**
 * 2. Pick one framing for the whole set, measured from the head rather than the face, so hair
 * is never clipped and heads look the same size even when hairstyles differ.
 *
 * Empty space above or beside a subject is filled with the paper tone and is invisible, but
 * running past the *bottom* of a photograph would slice through the body — so the shortest
 * photograph decides how tight the crop can be for everyone.
 */
const headHeightOf = ({ face, crown }) => face.y + face.height - crown

const headFraction = subjects.reduce((tightest, subject) => {
  const { meta } = subject
  const available = meta.height - subject.crown + HEADROOM * 0 // room below the crown
  const maxCropHeight = available / (1 - HEADROOM)
  return Math.max(tightest, (headHeightOf(subject) / maxCropHeight) * 1.02)
}, HEAD_HEIGHT)

// 3. Crop, place on paper and grade identically
for (const subject of subjects) {
  const { name, cutout, meta, face, crown } = subject
  const cropHeight = Math.round(headHeightOf(subject) / headFraction)
  const cropWidth = Math.round((OUT_WIDTH / OUT_HEIGHT) * cropHeight)
  const top = Math.round(crown - HEADROOM * cropHeight)
  const left = Math.round(face.x + face.width / 2 - cropWidth / 2)

  // Pad wherever the crop reaches past the photograph; the padding becomes paper tone
  const padTop = Math.max(0, -top)
  const padLeft = Math.max(0, -left)
  const padRight = Math.max(0, left + cropWidth - meta.width)
  const padBottom = Math.max(0, top + cropHeight - meta.height)

  const padded = await sharp(cutout)
    .ensureAlpha()
    .extend({
      top: padTop,
      left: padLeft,
      right: padRight,
      bottom: padBottom,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  const output = path.join(outDir, `${name}.jpg`)
  await sharp(padded)
    .extract({
      left: left + padLeft,
      top: top + padTop,
      width: cropWidth,
      height: cropHeight,
    })
    .resize(OUT_WIDTH, OUT_HEIGHT, { fit: 'fill' })
    .flatten({ background: BACKGROUND })
    // A light, consistent grade so portraits from different cameras sit together
    .modulate({ saturation: 0.88, brightness: 1.02 })
    .linear(1.04, -6)
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toFile(output)

  console.log(
    `${output}  crop ${cropWidth}×${cropHeight} of ${meta.width}×${meta.height}` +
      `  crown at ${crown}px, padding t${padTop} l${padLeft} r${padRight} b${padBottom}`,
  )
}

rmSync(work, { recursive: true, force: true })
