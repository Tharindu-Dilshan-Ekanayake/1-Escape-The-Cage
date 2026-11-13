import { mulberry32 } from '@shared/rng'

import { STYLE } from '../materials'
import { PALETTE } from '../sceneStyle'

/**
 * The lime lawns dotted over the light-blue baseplate, each with a few orange dirt
 * patches and a low kerb round it, as in the reference. The ground map paints the grass
 * and dirt (ground.js); the kerbs are blocks in the world's one block set.
 *
 * Laid out round the walkways: spawn to the boulder straight up the middle, the Train
 * Zones' walkway on the west, the shop on the east.
 */
export const LAWNS = [
  // West of the walkway to the boulder, the aura stand at its north end.
  { minX: -25, maxX: -9, minZ: -37, maxZ: -24 },
  { minX: -25, maxX: -9, minZ: -20, maxZ: 0 },
  // Round the potion stand, west of spawn.
  { minX: -25, maxX: -11, minZ: 3, maxZ: 16 },
  // East of the walkway, before the shop.
  { minX: 8, maxX: 15, minZ: -26, maxZ: -4 },
  // Round the Future World portal and the waterfall.
  { minX: 20, maxX: 46, minZ: -37, maxZ: -27 },
  // Round the Sphinx, south-east.
  { minX: 27, maxX: 46, minZ: 15, maxZ: 31 },
]

/** Kerb height and width: low enough to step over. */
const CURB_H = 0.16
const CURB_W = 0.7

/**
 * A few dirt patches inside each lawn, the same everywhere (seeded): rects in world
 * units, kept a little in from the edges.
 */
export const DIRT_PATCHES = LAWNS.flatMap((lawn, i) => {
  const rand = mulberry32(31 + i * 17)
  const w = lawn.maxX - lawn.minX
  const d = lawn.maxZ - lawn.minZ
  const count = Math.max(2, Math.round((w * d) / 90))
  return Array.from({ length: count }, () => {
    const pw = 2 + Math.floor(rand() * 4)
    const pd = 2 + Math.floor(rand() * 3)
    const x = Math.floor(lawn.minX + 2 + rand() * Math.max(1, w - pw - 4))
    const z = Math.floor(lawn.minZ + 2 + rand() * Math.max(1, d - pd - 4))
    return { minX: x, maxX: x + pw, minZ: z, maxZ: z + pd }
  })
})

/** The kerbs round every lawn. */
export function buildLawnCurbs(blocks) {
  for (const l of LAWNS) {
    const w = l.maxX - l.minX
    const d = l.maxZ - l.minZ
    const cx = (l.minX + l.maxX) / 2
    const cz = (l.minZ + l.maxZ) / 2
    for (const side of [-1, 1]) {
      blocks.addOn(cx, 0, cz + side * (d / 2 + CURB_W / 2), w + CURB_W * 2, CURB_H, CURB_W, PALETTE.curb, STYLE.STUDS)
      blocks.addOn(cx + side * (w / 2 + CURB_W / 2), 0, cz, CURB_W, CURB_H, d, PALETTE.curb, STYLE.STUDS)
    }
  }
}
