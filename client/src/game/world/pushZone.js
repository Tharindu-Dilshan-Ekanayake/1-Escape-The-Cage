import { WORLDS } from '@shared/balance'
import { PUSH_ZONE, TRACK_HALF_WIDTH, TRACK_START_Z } from '@shared/world'

import { STYLE } from '../materials'
import { STAGE_THEMES } from '../push/themes'

/** World 1's first stage floor, which starts early on the push zone. */
const FLOOR = STAGE_THEMES[WORLDS[0].stages[0].id].floor
const WOOD = '#e8913a'
const WOOD_DARK = '#9a5a26'
const WOOD_SEAM = '#c8702a'
const TRIM = '#ffd21f'

/**
 * The wooden sign beside the boulder: its board's middle, the board's size, and how far
 * it's turned (about y) towards the plaza.
 */
export const PUSH_SIGN = { x: -TRACK_HALF_WIDTH - 2.6, y: 2.8, z: TRACK_START_Z + 2.4, width: 4.4, height: 2.4, yaw: 0.35 }

/** A spot on the sign, `u` across its board and `w` out in front of it, at height y: [x, y, z]. */
export function onPushSign(u, y, w) {
  const { x, z, yaw } = PUSH_SIGN
  return [x + u * Math.cos(yaw) + w * Math.sin(yaw), y, z - u * Math.sin(yaw) + w * Math.cos(yaw)]
}

/**
 * The foot of the track: its first stage's floor running out onto the plaza as the PUSH ZONE
 * (painted with PUSH! - see signs.js), white chevrons pointing up the mountain, and the
 * reference's orange wooden "Push Boulder to START!" sign by the boulder (its words are
 * painted on too). Boxes in the world's block set: no extra draw calls.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on (flush faces flicker, worst on phones' coarser depth buffers).
 */
export function buildPushZone(blocks) {
  const { minX, maxX, minZ, maxZ } = PUSH_ZONE
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const w = maxX - minX
  const d = maxZ - minZ

  // The green strip, on a white border, right up to where the slope starts.
  blocks.addOn(cx, 0, cz, w + 1, 0.05, d, '#f4f7fb')
  blocks.addOn(cx, 0.05, cz, w, 0.05, d - 0.6, FLOOR)
  // Chevrons either side of the painted PUSH!, pointing up the track.
  for (const x of [-2.6, 2.6]) {
    for (const side of [-1, 1]) {
      blocks.add(x + side * 0.38, 0.12, cz, 1.15, 0.04, 0.4, '#ffffff', STYLE.GLOW, -side * 0.75)
    }
  }

  // The sign: a framed board of orange planks, gold along its top and bolted at the
  // corners, on two capped posts behind it - nothing in front of its words.
  const { y, width, height, yaw } = PUSH_SIGN
  const top = y + height / 2
  for (const side of [-1, 1]) {
    const [px, , pz] = onPushSign(side * (width / 2 - 0.5), 0, -0.24)
    blocks.addOn(px, 0, pz, 0.32, top + 0.3, 0.32, WOOD_DARK, STYLE.SMOOTH, yaw)
    blocks.addOn(px, top + 0.3, pz, 0.44, 0.14, 0.44, TRIM, STYLE.SMOOTH, yaw)
  }
  blocks.add(...onPushSign(0, y, 0), width, height, 0.2, WOOD_DARK, STYLE.SMOOTH, yaw)
  blocks.add(...onPushSign(0, y, 0.1), width - 0.3, height - 0.3, 0.06, WOOD, STYLE.SMOOTH, yaw)
  for (const k of [-1, 0, 1]) {
    blocks.add(...onPushSign(0, y + (k * (height - 0.3)) / 4, 0.135), width - 0.3, 0.035, 0.02, WOOD_SEAM, STYLE.SMOOTH, yaw)
  }
  blocks.add(...onPushSign(0, top + 0.07, 0.02), width + 0.12, 0.14, 0.3, TRIM, STYLE.SMOOTH, yaw)
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      blocks.add(...onPushSign(su * (width / 2 - 0.08), y + sv * (height / 2 - 0.08), 0.11), 0.1, 0.1, 0.04, '#f4f7fb', STYLE.SMOOTH, yaw)
    }
  }
}
