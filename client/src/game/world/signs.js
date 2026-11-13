import { CanvasTexture, LinearMipmapLinearFilter, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'

import { PUSH_ZONE, SHOP_SIGN } from '@shared/world'

import { onPushSign, PUSH_SIGN } from './pushZone'

const FONT = '"Fredoka One", "Arial Rounded MT Bold", sans-serif'

/**
 * Big chunky lettering painted on a textured quad, slanted by shear (the font has no
 * italic face): a solid extruded edge in `edge` under a thick dark outline, the face
 * filled with a top-to-bottom gradient of `fill` stops, and a glossy band across the
 * top of each letter. `text` is one line, or several as [{ text, fill, edge }] - each in
 * its own band, as big as fits. Every painted sign shares one material setup, so one
 * shader program.
 */
function paintText(text, maxTexture, { aspect, fill, edge, slant = 0.22, worldWidth }) {
  const width = Math.min(1024, maxTexture)
  const height = Math.round(width * aspect)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const lines = Array.isArray(text) ? text : [{ text, fill, edge }]
  const band = height / lines.length
  lines.forEach((line, i) => paintLine(ctx, line, width, band, band * i, slant))

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearMipmapLinearFilter
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const geometry = new PlaneGeometry(worldWidth, worldWidth * aspect)
  return { geometry, material, texture }
}

/** One line of paintText's lettering, in the band `height` tall from `top`, `width` wide. */
function paintLine(ctx, { text, fill, edge }, width, height, top, slant) {
  // As tall as the band allows, shrunk if needed so the outline and slant still fit.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.font = `100px ${FONT}`
  const size = Math.min(height * 0.7, (100 * width * 0.95) / (ctx.measureText(text).width * (1 + slant * 0.5)))
  const x = width / 2
  const y = top + height * 0.46
  const depth = size * 0.1
  ctx.font = `${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  // Slanted about the line's own middle, so every line stays centred.
  ctx.setTransform(1, 0, -slant, 1, y * slant, 0)

  // The extruded edge: the outlined letters stacked downwards, darkest at the back.
  ctx.lineWidth = size * 0.22
  ctx.strokeStyle = '#10142a'
  ctx.fillStyle = edge
  for (let i = depth; i > 0; i -= Math.max(1, depth / 8)) {
    ctx.strokeText(text, x, y + i)
    ctx.fillText(text, x, y + i)
  }
  // Outline and face.
  ctx.strokeText(text, x, y)
  const gradient = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45)
  fill.forEach((stop, i) => gradient.addColorStop(i / (fill.length - 1), stop))
  ctx.fillStyle = gradient
  ctx.fillText(text, x, y)
  // Gloss on the upper part of the letters only (drawn onto what's already there).
  ctx.globalCompositeOperation = 'source-atop'
  const gloss = ctx.createLinearGradient(0, y - size * 0.45, 0, y)
  gloss.addColorStop(0, 'rgba(255,255,255,0.55)')
  gloss.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gloss
  ctx.fillRect(-width, y - size * 0.45, width * 3, size * 0.4)
  ctx.globalCompositeOperation = 'source-over'
}

/**
 * The painted signs, drawn once the font has loaded: "PUSH!" across the push zone at the
 * foot of the track, "Push Boulder to START!" on the wooden sign by the boulder and
 * "DUMBBELLS" on the shop's sign. Each sits a couple of
 * centimetres proud of what it's painted on, so it can't sink into it.
 *
 * @param {number} maxTexture texture size cap for the preset
 * @returns {Promise<Array<{ geometry, material, texture, position: number[], rotation: number[] }>>}
 */
export async function createPaintedSigns(maxTexture) {
  await document.fonts?.load(`64px ${FONT}`).catch(() => null)

  const zoneWidth = PUSH_ZONE.maxX - PUSH_ZONE.minX - 4.2
  const zone = paintText('PUSH!', maxTexture, {
    aspect: 0.32,
    fill: ['#ffffff', '#ffffff', '#e6ecf5'],
    edge: '#9aa6b8',
    worldWidth: zoneWidth,
  })
  // Just above the strip's raised green fill (its top is 0.1 up), read from the plaza.
  zone.position = [0, 0.13, (PUSH_ZONE.minZ + PUSH_ZONE.maxZ) / 2]
  zone.rotation = [-Math.PI / 2, 0, 0]

  const signWidth = SHOP_SIGN.maxZ - SHOP_SIGN.minZ - 3
  const shop = paintText('DUMBBELLS', maxTexture, {
    aspect: 0.22,
    fill: ['#e0faff', '#7fe2ff', '#2fa8ff'],
    edge: '#1d5fa8',
    slant: 0.14,
    worldWidth: signWidth,
  })
  // On the sign's slate face (0.4 west of its centre line), turned to the plaza.
  shop.position = [SHOP_SIGN.x - 0.43, SHOP_SIGN.top - 4.1, (SHOP_SIGN.minZ + SHOP_SIGN.maxZ) / 2]
  shop.rotation = [0, -Math.PI / 2, 0]

  // The start sign's words, on its board's planks, turned with it.
  const { y, width, height, yaw } = PUSH_SIGN
  const start = paintText(
    [
      { text: 'Push Boulder', fill: ['#ffffff', '#ffffff', '#ffe6c4'], edge: '#7a3f12' },
      { text: 'to START!', fill: ['#fff7a8', '#ffd21f', '#ff9c00'], edge: '#7a3f12' },
    ],
    maxTexture,
    { aspect: (height - 0.5) / (width - 0.5), slant: 0.1, worldWidth: width - 0.5 },
  )
  start.position = onPushSign(0, y, 0.17)
  start.rotation = [0, yaw, 0]

  return [zone, start, shop]
}
