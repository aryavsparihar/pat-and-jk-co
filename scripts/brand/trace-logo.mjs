#!/usr/bin/env node
/**
 * Vectorise a raster logo into a recolourable SVG (fill="currentColor").
 *
 * Usage:
 *   node scripts/brand/trace-logo.mjs <input.png> <output.svg> [--crop x,y,w,h] [--scale 3]
 *
 * Requires `potrace` on the PATH (macOS: `brew install potrace`).
 * The SVG uses currentColor, so the same file renders green on ivory or ivory on green.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const args = process.argv.slice(2)
const [input, output] = args
if (!input || !output) {
  console.error('Usage: trace-logo.mjs <input.png> <output.svg> [--crop x,y,w,h] [--scale 3]')
  process.exit(1)
}

const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const crop = flag('--crop')?.split(',').map(Number)
const scale = Number(flag('--scale') ?? 3)

let img = sharp(input).flatten({ background: '#ffffff' })
if (crop) img = img.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] })
const source = await img.png().toBuffer()
const { width } = await sharp(source).metadata()

const { data, info } = await sharp(source)
  .resize({ width: Math.round(width * scale), kernel: 'lanczos3' })
  .grayscale()
  .blur(0.6)
  .raw()
  .toBuffer({ resolveWithObject: true })

const dir = mkdtempSync(path.join(tmpdir(), 'trace-'))
const pgm = path.join(dir, 'in.pgm')
writeFileSync(pgm, Buffer.concat([Buffer.from(`P5\n${info.width} ${info.height}\n255\n`), data]))

const svgPath = path.join(dir, 'out.svg')
execFileSync('potrace', [
  pgm,
  '-s',
  '--tight',
  '-k',
  '0.5',
  '-t',
  '8',
  '-a',
  '1.0',
  '-O',
  '0.4',
  '-o',
  svgPath,
])

const svg = readFileSync(svgPath, 'utf8')
  .replace(/<\?xml[^>]*>\s*/, '')
  .replace(/<!DOCTYPE[^>]*>\s*/, '')
  .replace(/<metadata>[\s\S]*?<\/metadata>\s*/, '')
  .replace(/fill="#000000"/g, 'fill="currentColor"')
  .replace(/ width="[^"]*pt" height="[^"]*pt"/, '')
  .replace(/\n\s*\n/g, '\n')

writeFileSync(output, svg.trim() + '\n')
rmSync(dir, { recursive: true, force: true })
console.log(`Wrote ${output}`)
