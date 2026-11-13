import { CylinderGeometry } from 'three'

import { AURAS } from '@shared/balance'
import {
  AURA_STAND,
  BENCH_HALF,
  BENCH_X,
  POTION_STAND,
  SEAT_HEIGHT,
  SHOP_SIGN,
  SHOP_STAGES,
  STATUE,
  ZONE_COUNT,
  ZONE_HALF,
  ZONE_HEIGHT,
  ZONE_RACK_X,
  ZONE_X,
  zoneCenterZ,
  zoneDeckRect,
} from '@shared/world'

import { toColor } from '../blocks'
import { STYLE } from '../materials'
import { flexingBodybuilder } from '../muscleBody'

/**
 * Static lobby structures, added as plain boxes to the world's shared BlockSet so they
 * render in the same single draw call as the mountains.
 */

/**
 * Per-zone look, in Train Zone order (matches TRAIN_ZONES in shared/balance.js): the
 * pad, its dark rim and the style of its top, and the colour of its labels.
 */
export const ZONE_THEMES = [
  { pad: '#ffd23a', rim: '#262b35', style: STYLE.STUDS, text: '#ffe45c' },
  { pad: '#ff4747', rim: '#262b35', style: STYLE.STUDS, text: '#ff8a7a' },
  { pad: '#4fdc4a', rim: '#262b35', style: STYLE.STUDS, text: '#8dff4f' },
  { pad: '#ffc21a', rim: '#6b4c0c', style: STYLE.PLATE, text: '#ffe45c', crystals: '#ffd21f' },
  { pad: '#ff5a1c', rim: '#2a1712', style: STYLE.LAVA, text: '#ff9a3c' },
  { pad: '#9fe8ff', rim: '#2b5f8f', style: STYLE.GLOW, text: '#c9f3ff', crystals: '#bff4ff' },
  { pad: '#2a1f6a', rim: '#120d33', style: STYLE.GALAXY, text: '#d39bff', crystals: '#c35cff' },
]

/** A gym mat's colour: the pad's, darkened. */
const mats = new Map()
function mat(color) {
  if (!mats.has(color)) mats.set(color, toColor(color).clone().multiplyScalar(0.72))
  return mats.get(color)
}

const IRON = '#2b2f38'
const STEEL = '#d9e0e8'
const PLATE = '#1d2027'

/** A flat bench with a barbell racked over it, the bar running north-south. */
function benchPress(blocks, x, base, z, plate) {
  blocks.addOn(x + 0.25, base, z, 1.5, 0.48, 0.55, IRON, STYLE.SMOOTH)
  blocks.addOn(x + 0.25, base + 0.48, z, 1.4, 0.12, 0.6, '#3a4150', STYLE.SMOOTH)
  for (const side of [-1, 1]) blocks.addOn(x - 0.55, base, z + side * 0.6, 0.16, 1.45, 0.16, IRON, STYLE.SMOOTH)
  const barY = base + 1.38
  blocks.add(x - 0.45, barY, z, 0.07, 0.07, 2.1, STEEL, STYLE.SMOOTH)
  for (const side of [-1, 1]) {
    blocks.add(x - 0.45, barY, z + side * 0.88, 0.62, 0.62, 0.16, plate, STYLE.SMOOTH)
    blocks.add(x - 0.45, barY, z + side * 0.72, 0.42, 0.42, 0.12, plate, STYLE.SMOOTH)
  }
}

/** A low rack with three dumbbells lying on it. */
function dumbbellRack(blocks, x, base, z, plate) {
  blocks.addOn(x, base, z, 0.8, 0.7, 2, IRON, STYLE.SMOOTH)
  for (let i = -1; i <= 1; i += 1) {
    const dz = z + i * 0.62
    blocks.add(x, base + 0.83, dz, 0.56, 0.05, 0.05, STEEL, STYLE.SMOOTH)
    for (const side of [-1, 1]) blocks.add(x + side * 0.24, base + 0.83, dz, 0.1, 0.26, 0.26, plate, STYLE.SMOOTH)
  }
}

/** Big tilted crystals behind the fancier gyms. */
function crystals(blocks, x, z, color) {
  blocks.add(x, 3, z - 1.4, 1.6, 6, 1.6, color, STYLE.GLOW, 0.4, 0, 0.18)
  blocks.add(x + 0.4, 2, z + 1.2, 1.2, 4.2, 1.2, color, STYLE.GLOW, 1.1, 0, -0.3)
  blocks.add(x - 0.6, 1.3, z, 0.9, 2.8, 0.9, color, STYLE.GLOW, 0.2, 0.3, 0.35)
}

/**
 * The Train Zones: a raised pad in each gym's colour on a dark rim, and along its back
 * (west) edge a row of equipment - bench presses either side of a dumbbell rack - with
 * glowing crystals behind the fancier ones.
 */
export function buildTrainZones(blocks) {
  for (let i = 0; i < ZONE_COUNT; i += 1) {
    const theme = ZONE_THEMES[i]
    const cz = zoneCenterZ(i)
    const deck = zoneDeckRect(i)
    blocks.addOn(ZONE_X, -0.1, cz, deck.maxX - deck.minX, ZONE_HEIGHT + 0.1, deck.maxZ - deck.minZ, theme.rim, STYLE.SMOOTH)
    blocks.addOn(ZONE_X, ZONE_HEIGHT - 0.06, cz, ZONE_HALF.x * 2 - 0.3, 0.1, ZONE_HALF.z * 2 - 0.3, theme.pad, theme.style)
    // A gym mat let into the plain pads, a shade darker, with tile seams.
    if (theme.style === STYLE.STUDS || theme.style === STYLE.PLATE) {
      blocks.addOn(ZONE_X + 0.8, ZONE_HEIGHT, cz, ZONE_HALF.x * 2 - 3.2, 0.06, ZONE_HALF.z * 2 - 1.2, mat(theme.pad), STYLE.TILES)
    }
    // A lamp post at each corner, lit in the gym's colour.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lx = ZONE_X + sx * (ZONE_HALF.x - 0.3)
        const lz = cz + sz * (ZONE_HALF.z - 0.3)
        blocks.addOn(lx, ZONE_HEIGHT, lz, 0.3, 1.9, 0.3, theme.rim === '#262b35' ? '#3a4150' : theme.rim, STYLE.SMOOTH)
        blocks.add(lx, ZONE_HEIGHT + 2.12, lz, 0.5, 0.5, 0.5, theme.text, STYLE.GLOW)
        blocks.add(lx, ZONE_HEIGHT + 2.44, lz, 0.62, 0.12, 0.62, '#2b2f38', STYLE.SMOOTH)
      }
    }
    const plate = i === 0 ? PLATE : theme.rim
    benchPress(blocks, ZONE_RACK_X, ZONE_HEIGHT, cz - 2.2, plate)
    dumbbellRack(blocks, ZONE_RACK_X - 0.1, ZONE_HEIGHT, cz + 0.1, plate)
    benchPress(blocks, ZONE_RACK_X, ZONE_HEIGHT, cz + 2.4, plate)
    trainingBench(blocks, BENCH_X, ZONE_HEIGHT, cz, theme.pad)
    if (theme.crystals) crystals(blocks, deck.minX - 2.4, cz, theme.crystals)
  }
}

const CUSHION = '#262b35'

/**
 * A Train Zone's long training bench, facing east and BENCH_HALF either way of z: a
 * long padded seat in the zone's colour (its top SEAT_HEIGHT over the pad) on steel
 * legs, with a padded backrest the length of it.
 */
function trainingBench(blocks, x, y, z, color) {
  const top = y + SEAT_HEIGHT
  const length = BENCH_HALF * 2
  for (let i = 0; i <= 4; i += 1) {
    const lz = z - BENCH_HALF + 0.25 + ((length - 0.5) * i) / 4
    blocks.addOn(x, y, lz, 0.5, top - y - 0.12, 0.1, STEEL, STYLE.SMOOTH)
    blocks.addOn(x - 0.4, top - 0.12, lz, 0.08, 0.5, 0.08, STEEL, STYLE.SMOOTH)
  }
  blocks.addOn(x, top - 0.12, z, 0.72, 0.12, length, color, STYLE.SMOOTH)
  blocks.addOn(x + 0.02, top - 0.02, z, 0.62, 0.04, length - 0.1, CUSHION, STYLE.SMOOTH)
  blocks.add(x - 0.42, top + 0.55, z, 0.12, 0.5, length - 0.04, color, STYLE.SMOOTH, 0, 0, 0.12)
}

const STONE = '#8d97a2'
const STONE_TOP = '#b9c2cc'
const SLATE = '#3b4658'
const RED = '#ff4a3b'
const GOLD = '#ffd21f'

/**
 * The dumbbell shop: two grey stone display stages (the stands on them are
 * DumbbellShop's) and the big sign behind, a slate panel in a stone frame with red
 * light strips. `detail` (off on LOW) adds the sign's bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on.
 */
export function buildShop(blocks, { detail = true } = {}) {
  for (const s of SHOP_STAGES) {
    const w = s.maxX - s.minX
    const d = s.maxZ - s.minZ
    const cx = (s.minX + s.maxX) / 2
    const cz = (s.minZ + s.maxZ) / 2
    blocks.addOn(cx, -0.1, cz, w, s.height + 0.1, d, STONE_TOP)
    blocks.addOn(cx, 0, cz, w + 0.3, s.height * 0.5, d + 0.3, STONE)
    // Light strips along all four top edges, and a gold post at each corner.
    for (const side of [-1, 1]) {
      blocks.addOn(cx + side * (w / 2 - 0.25), s.height, cz, 0.35, 0.08, d - 1.4, RED, STYLE.GLOW)
      blocks.addOn(cx, s.height, cz + side * (d / 2 - 0.25), w - 1.4, 0.08, 0.35, RED, STYLE.GLOW)
      for (const end of [-1, 1]) {
        blocks.addOn(cx + side * (w / 2 - 0.35), s.height, cz + end * (d / 2 - 0.35), 0.6, 0.7, 0.6, GOLD, STYLE.GLOW)
      }
    }
  }

  // The sign: two striped legs, a slate panel in a stone frame, a gold cap.
  const { x, minZ, maxZ, top } = SHOP_SIGN
  const length = maxZ - minZ
  const midZ = (minZ + maxZ) / 2
  const bottom = top - 8.2
  for (const z of [minZ + 1.5, maxZ - 1.5]) blocks.addOn(x + 0.1, 0, z, 0.9, bottom + 0.3, 0.9, STONE, STYLE.STRIPES)
  blocks.addOn(x, bottom, midZ, 0.6, top - bottom, length, STONE)
  blocks.addOn(x - 0.1, bottom + 0.5, midZ, 0.6, top - bottom - 1, length - 1, SLATE, STYLE.SMOOTH)
  blocks.addOn(x, top, midZ, 0.9, 0.4, length + 0.4, GOLD, STYLE.GLOW)
  if (detail) {
    for (let z = minZ + 1; z <= maxZ - 0.99; z += 1.5) {
      blocks.add(x - 0.42, bottom + 0.25, z, 0.16, 0.3, 0.3, Math.round(z) % 2 ? '#ffffff' : RED, STYLE.GLOW)
      blocks.add(x - 0.42, top - 0.25, z + 0.75, 0.16, 0.3, 0.3, Math.round(z) % 2 ? RED : '#ffffff', STYLE.GLOW)
    }
  }
}

/** Glowing orb on a pedestal, in an aura's colour. */
/** An aura on show: a white pedestal, a glowing plate on it, and the aura's orb with a bright core. */
function auraOrb(blocks, x, base, z, color) {
  blocks.addOn(x, base, z, 0.66, 0.95, 0.66, '#f4f7fb', STYLE.SMOOTH)
  blocks.addOn(x, base + 0.95, z, 0.86, 0.12, 0.86, '#c79bff', STYLE.GLOW)
  blocks.add(x, base + 1.65, z, 0.78, 0.78, 0.78, color, STYLE.GLOW, 0.785, 0.6, 0)
  blocks.add(x, base + 1.65, z, 0.5, 0.5, 0.5, '#ffffff', STYLE.GLOW, 0, 0.785, 0.6)
}

const AURA_PURPLE = '#5b2fb0'
const AURA_TRIM = '#c79bff'

/**
 * The aura store, a booth: a glowing-edged octagonal floor; a purple backdrop with a
 * lit trim and a great crystal on it, between two pillars topped with gold; every aura
 * on show on its own pedestal in front of it; and the counter you buy at. And the
 * potion stand: two tall glowing tubes, yellow and pink, in white frames.
 */
export function buildStands(blocks) {
  {
    const { x, z } = AURA_STAND
    const floor = 0.22
    // The floor: two squares turned an eighth apart, edged with light.
    for (const turn of [0, Math.PI / 4]) {
      blocks.addOn(x, 0, z, 7.9, 0.14, 7.9, AURA_TRIM, STYLE.GLOW, turn)
      blocks.addOn(x, 0, z, 7.6, floor, 7.6, '#3b2a74', STYLE.STUDS, turn)
    }
    // The backdrop and its pillars.
    const back = z - 3.5
    blocks.addOn(x, floor, back, 7.4, 4.4, 0.5, AURA_PURPLE, STYLE.STUDS)
    blocks.addOn(x, floor + 4.4, back, 7.6, 0.25, 0.7, AURA_TRIM, STYLE.GLOW)
    blocks.add(x, floor + 3, back + 0.3, 1.3, 1.3, 0.2, '#e8d8ff', STYLE.GLOW, 0, 0, Math.PI / 4)
    for (const side of [-1, 1]) {
      blocks.addOn(x + side * 3.95, 0, back, 0.9, floor + 5, 0.9, '#7a4ad8', STYLE.STUDS)
      blocks.add(x + side * 3.95, floor + 5.5, back, 0.8, 0.8, 0.8, '#ffd21f', STYLE.GLOW, 0.785, 0.6, 0)
    }
    // Every aura on show, in a row before the backdrop.
    const auras = Object.values(AURAS)
    auras.forEach((aura, i) => auraOrb(blocks, x + (i - (auras.length - 1) / 2) * 1.3, floor, z - 2.4, aura.color))
    // The counter.
    blocks.addOn(x, floor, z - 1.2, 5.6, 0.85, 1.3, AURA_PURPLE, STYLE.STUDS)
    blocks.addOn(x, floor + 0.85, z - 1.2, 5.9, 0.16, 1.6, AURA_TRIM, STYLE.GLOW)
  }
  {
    const { x, z } = POTION_STAND
    const tx = x - 1.2
    blocks.addOn(tx, 0, z, 2.2, 0.5, 5.4, '#e6edf5', STYLE.STUDS)
    for (const [dz, color] of [
      [-1.25, '#ffe14a'],
      [1.25, '#ff8fe0'],
    ]) {
      blocks.addOn(tx, 0.5, z + dz, 1.5, 0.35, 1.5, '#9aa4b0', STYLE.SMOOTH)
      blocks.addOn(tx, 0.85, z + dz, 1.2, 3.4, 1.2, color, STYLE.GLOW)
      blocks.addOn(tx, 4.25, z + dz, 1.5, 0.35, 1.5, '#9aa4b0', STYLE.SMOOTH)
      // A bottle standing inside, and the white frame round the tube.
      blocks.addOn(tx, 1.6, z + dz, 0.5, 0.9, 0.5, '#ffffff', STYLE.GLOW)
      for (const corner of [-1, 1]) blocks.addOn(tx + corner * 0.68, 0.85, z + dz + 0.68, 0.12, 3.4, 0.12, '#ffffff', STYLE.SMOOTH)
    }
    // Pipes joining them overhead.
    blocks.addOn(tx, 4.6, z, 0.3, 0.3, 3, '#ffd21f', STYLE.GLOW)
  }
}

const SKIN = '#f3e7dc'
const SHIRT = '#1b1f2b'
const BELT = '#2f7fe6'
const HAIR = '#a8541f'

/** The statue's size against the avatar it's modelled on (6.4 units tall). */
const STATUE_SCALE = 1.1
const SHOE = '#f4f7fb'

/**
 * The big bodybuilder statue by the boulder, flexing both arms at the plaza: the
 * players' own rounded body at its biggest (muscleBody), in a black shirt with a blue
 * tie and belt, on a stone plinth. Faces south. Its body goes in `props` (merged, one
 * draw call); the plinth and the blocky head in `blocks`.
 */
export function buildStatue(blocks, props) {
  const { x, z } = STATUE
  blocks.addOn(x, 0, z, 4.4, 1, 4.4, STONE)
  blocks.addOn(x, 1, z, 3.8, 0.25, 3.8, GOLD, STYLE.GLOW)
  const base = 1.25
  const k = STATUE_SCALE
  const at = (u, v, w) => [x + u * k, base + v * k, z + w * k]

  const body = flexingBodybuilder()
  props.add(body.torso, { position: at(0, 0, 0), scale: k, color: SHIRT })
  props.add(body.arm_L, { position: at(0, 0, 0), scale: k, color: SKIN })
  props.add(body.arm_R, { position: at(0, 0, 0), scale: k, color: SKIN })
  props.add(body.leg_L, { position: at(0, 0, 0), scale: k, color: SHIRT })
  props.add(body.leg_R, { position: at(0, 0, 0), scale: k, color: SHIRT })

  // The tie: a strip down the middle of the chest, laid along its curve.
  const front = []
  const pos = body.torso.getAttribute('position')
  for (let i = 0; i < pos.count; i += 1) {
    if (Math.abs(pos.getX(i)) < 0.01 && pos.getZ(i) > 0.3 && pos.getY(i) > 2.6 && pos.getY(i) < 4.8) front.push([pos.getY(i), pos.getZ(i)])
  }
  front.sort((a, b) => a[0] - b[0])
  const column = front.filter((p, i) => i === 0 || p[0] - front[i - 1][0] > 0.01)
  for (let i = 0; i < column.length - 1; i += 1) {
    const [y0, z0] = column[i]
    const [y1, z1] = column[i + 1]
    const length = Math.hypot(y1 - y0, z1 - z0)
    props.box(...at(0, (y0 + y1) / 2, (z0 + z1) / 2 + 0.04), 0.38 * k, (length + 0.02) * k, 0.06 * k, BELT, STYLE.SMOOTH, [Math.atan2(z1 - z0, y1 - y0), 0, 0])
  }
  for (const part of Object.values(body)) part.dispose()

  // The belt round the waist, and white shoes.
  const ring = new CylinderGeometry(1, 1, 1, 20)
  props.add(ring, { position: at(0, 2.58, 0.02), scale: [1.12 * k, 0.34 * k, 0.8 * k], color: BELT })
  for (const side of [-1, 1]) {
    props.add(ring, { position: at(side * 0.75, 0.15, 0.14), scale: [0.62 * k, 0.3 * k, 0.76 * k], color: SHOE })
  }
  ring.dispose()

  // The head, as blocky as the players': hair, eyes and a grin.
  blocks.addOn(...at(0, 4.85, 0), 1.6 * k, 1.6 * k, 1.6 * k, SKIN, STYLE.SMOOTH)
  blocks.addOn(...at(0, 6.3, -0.05), 1.72 * k, 0.45 * k, 1.72 * k, HAIR, STYLE.SMOOTH)
  blocks.addOn(...at(0, 5.3, -0.76), 1.72 * k, 1.1 * k, 0.3 * k, HAIR, STYLE.SMOOTH)
  for (const side of [-1, 1]) blocks.add(...at(side * 0.32, 5.75, 0.81), 0.16 * k, 0.26 * k, 0.05, '#1b1f2b', STYLE.SMOOTH)
  blocks.add(...at(0, 5.3, 0.81), 0.6 * k, 0.1 * k, 0.05, '#1b1f2b', STYLE.SMOOTH)
}
