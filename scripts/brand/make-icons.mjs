#!/usr/bin/env node
/**
 * Builds favicon.svg, apple-touch-icon.png, icon-512.png and the default OG image
 * from the traced brand SVGs in public/brand.
 *
 * Usage: node scripts/brand/make-icons.mjs [--primary #0F2A18] [--background #F6F3EC]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const primary = flag('--primary', '#0F2A18')
const background = flag('--background', '#F6F3EC')

const inner = (file) => {
  const svg = readFileSync(file, 'utf8')
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return { body, w: viewBox[2], h: viewBox[3] }
}

const wordmark = inner('public/brand/pjk-wordmark.svg')
const logo = inner('public/brand/pjk-logo.svg')

// Square icon: ivory wordmark on a woodland-green tile
const icon = (size, pad = 0.16, radius = 0.18) => {
  const s = 100
  const maxW = s * (1 - pad * 2)
  const scale = maxW / wordmark.w
  const h = wordmark.h * scale
  const body = wordmark.body.replace(/currentColor/g, background)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${size}" height="${size}">
<rect width="${s}" height="${s}" rx="${s * radius}" fill="${primary}"/>
<g transform="translate(${(s - maxW) / 2} ${(s - h) / 2}) scale(${scale})">${body}</g>
</svg>`
}

writeFileSync('public/favicon.svg', icon(32))
await sharp(Buffer.from(icon(180, 0.16, 0)), { density: 300 }).resize(180, 180).png().toFile('public/apple-touch-icon.png')
await sharp(Buffer.from(icon(512)), { density: 300 }).resize(512, 512).png().toFile('public/icon-512.png')
await sharp(Buffer.from(icon(48)), { density: 300 }).resize(48, 48).png().toFile('public/favicon-48.png')

// Open Graph image: full logo centred on ivory, 1200×630
const ogW = 1200
const ogH = 630
const logoW = 560
const scale = logoW / logo.w
const logoH = logo.h * scale
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ogW} ${ogH}" width="${ogW}" height="${ogH}">
<rect width="${ogW}" height="${ogH}" fill="${background}"/>
<rect x="28" y="28" width="${ogW - 56}" height="${ogH - 56}" fill="none" stroke="${primary}" stroke-opacity="0.18"/>
<g transform="translate(${(ogW - logoW) / 2} ${(ogH - logoH) / 2}) scale(${scale})" fill="${primary}">${logo.body.replace(/currentColor/g, primary)}</g>
</svg>`
await sharp(Buffer.from(og), { density: 144 }).resize(ogW, ogH).png().toFile('public/brand/og-default.png')

console.log('Icons and OG image written to public/')
