import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { CAGE_RETURN, cageWallZ, GAUNTLET, roomCenterZ, winPadRect } from '@shared/world'

import { BlockSet } from '../blocks'
import { STYLE } from '../materials'
import { cageTheme } from './themes'

/**
 * The gauntlet's geometry, as boxes for the shared toy material: everything that never
 * moves in one BlockSet (one draw call), and the bars that bend open when a cage breaks
 * in another (one more), whose matrices placeDoor() rewrites.
 *
 * Bars are slim rods (BAR square), 1.5 m apart, ringed every 0.75 m (STYLE.BARS); the
 * walls they stand in are solid to walk into whatever the gaps look like (see world.js).
 */

const { halfWidth: HW, roomDepth: DEPTH, height: H } = GAUNTLET
const BAR = 0.3
/** The beam the bars hang from across a wall, and the posts at its ends. */
const BEAM = 0.7
/** The four bars across a cage's middle: the ones that bend open. */
export const DOOR_BARS = [-2.25, -0.75, 0.75, 2.25]
/** How far each door bar is pulled out to its side when the cage breaks (inner ones most). */
const DOOR_SPREAD = [2.05, 3.0, 3.0, 2.05]
/** The rest of a wall's bars, either side of the door. */
const WALL_BARS = [3.75, 5.25, 6.75, 8.25, 9.75, 11.25].flatMap((x) => [-x, x])
/** Each door bar is this many stacked blocks, so it can curve as it bends. */
export const DOOR_SEGMENTS = 8
const SEGMENT = H / DOOR_SEGMENTS

const RIM = '#1d2027'
const PAD_TOP = '#ffd21f'
const PAD_EDGE = '#fff3a0'
const YARD = '#6f665c'
const GATE = '#2b303b'

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)))
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`
}

/** A glowing chevron on the floor at (x, z), pointing west (towards a WIN pad): "<". */
function chevron(set, x, z, color) {
  for (const side of [-1, 1]) set.add(x, 0.03, z + side * 0.38, 0.4, 0.04, 1.15, color, STYLE.GLOW, side * 0.75)
}

/** One cage's wall of bars at z = cageWallZ(i), all but the four across its middle. */
function addWall(set, i, theme) {
  const wz = cageWallZ(i)
  const dark = shade(theme.bars, 0.62)
  for (const x of WALL_BARS) set.addOn(x, 0.2, wz, BAR, H - 0.2, BAR, theme.bars, theme.barStyle)
  // A sill under the bars either side of the door (not across it: nothing to trip on).
  const sillIn = GAUNTLET.doorHalf + 0.05
  const sillOut = HW + 0.45
  for (const side of [-1, 1]) set.addOn((side * (sillIn + sillOut)) / 2, 0, wz, sillOut - sillIn, 0.2, 0.6, dark, STYLE.SMOOTH)
  // The lintel the bars hang from, and a thick post at each end.
  set.add(0, H + 0.25, wz, HW * 2 + 0.8, 0.5, BEAM, dark, STYLE.BARS)
  for (const side of [-1, 1]) set.addOn(side * HW, 0, wz, BEAM, H + 0.5, BEAM, dark, STYLE.BARS)
}

/** Room `i`, behind cage `i`: floor, side walls, roof, its WIN pad and two glowing posts by the next cage. */
function addRoom(set, i, theme) {
  const wz = cageWallZ(i)
  const cz = roomCenterZ(i)
  const dark = shade(theme.bars, 0.62)
  // The floor, and gravel out to the cliffs either side.
  set.addOn(0, -0.3, cz, HW * 2 + 0.4, 0.3, DEPTH, theme.floor, theme.floorStyle)
  for (const side of [-1, 1]) set.addOn(side * (HW + 2.4), -0.3, cz, 4.4, 0.32, DEPTH, YARD, STYLE.STUDS)
  // Side walls: bars every 1.5 m between a rail along the floor and one along the top.
  const first = Math.ceil((wz - DEPTH + 0.8) / 1.5) * 1.5
  for (let z = first; z < wz - 0.8; z += 1.5) {
    for (const side of [-1, 1]) set.addOn(side * HW, 0.3, z, BAR, H - 0.3, BAR, theme.bars, theme.barStyle)
  }
  for (const side of [-1, 1]) {
    set.addOn(side * HW, 0, cz, 1.05, 0.32, DEPTH, dark, STYLE.SMOOTH)
    set.add(side * HW, H + 0.25, cz, BEAM, 0.5, DEPTH, dark, STYLE.BARS)
  }
  // The roof: beams across every 3 m and one down the middle.
  for (let z = wz - 3; z > wz - DEPTH + 0.5; z -= 3) set.add(0, H + 0.3, z, HW * 2, BAR, BAR, theme.bars, theme.barStyle)
  set.add(0, H + 0.3, cz, BAR, BAR, DEPTH, theme.bars, theme.barStyle)
  // A glowing post either side of the next cage, so its way stands out down the hall.
  for (const side of [-1, 1]) {
    const x = side * (HW - 1.3)
    const z = wz - DEPTH + 1.4
    set.addOn(x, 0, z, 0.9, 2.2, 0.9, dark, STYLE.SMOOTH)
    set.addOn(x, 2.2, z, 1.2, 0.18, 1.2, RIM, STYLE.SMOOTH)
    set.addOn(x, 2.38, z, 0.85, 0.85, 0.85, theme.accent, STYLE.GLOW, Math.PI / 4)
  }
  // The WIN pad on the left: a thin gold square in a dark rim, edged with light.
  const pad = winPadRect(i)
  const px = (pad.minX + pad.maxX) / 2
  const pz = (pad.minZ + pad.maxZ) / 2
  const pw = pad.maxX - pad.minX
  const pd = pad.maxZ - pad.minZ
  set.addOn(px, 0, pz, pw + 0.5, 0.05, pd + 0.5, RIM, STYLE.SMOOTH)
  set.addOn(px, 0.05, pz, pw, 0.04, pd, PAD_TOP, STYLE.STUDS)
  for (const side of [-1, 1]) {
    set.addOn(px, 0.05, pz + side * (pd / 2 + 0.12), pw + 0.4, 0.07, 0.16, theme.accent, STYLE.GLOW)
    set.addOn(px + side * (pw / 2 + 0.12), 0.05, pz, 0.16, 0.07, pd, theme.accent, STYLE.GLOW)
  }
  set.addOn(px, 0.09, pz, 1.6, 0.03, 1.6, PAD_EDGE, STYLE.GLOW, Math.PI / 4)
  // Chevrons on the floor leading from the middle of the room to the pad.
  for (const x of [-1, -2.4]) chevron(set, x, pz, '#ffffff')
}

/** The solid gate at the far end of a gauntlet of `count` cages: no way on but back. */
function addGate(set, count, theme) {
  const z = cageWallZ(count)
  const dark = shade(theme.bars, 0.62)
  set.addOn(0, 0, z - 0.9, HW * 2 + 1.4, H + 1, 0.6, GATE, STYLE.BLOCK)
  for (let x = -HW + 0.75; x <= HW - 0.75; x += 1.5) set.addOn(x, 0.2, z, BAR, H - 0.2, BAR, '#ffd21f', STYLE.BARS)
  set.add(0, H + 0.25, z, HW * 2 + 0.8, 0.5, BEAM, dark, STYLE.BARS)
  for (const side of [-1, 1]) set.addOn(side * HW, 0, z, BEAM, H + 0.5, BEAM, dark, STYLE.BARS)
}

/**
 * The way in from the plaza: two great studded pillars either side of the first cage
 * with a beam across them, a dark mat in front of the bars and white chevrons pointing
 * in. (Its words float over it: see Cages.)
 */
function addEntrance(set, first) {
  const z = GAUNTLET.startZ
  const theme = cageTheme(first.id)
  for (const side of [-1, 1]) {
    set.addOn(side * (HW + 1.6), 0, z + 0.6, 2.4, H + 3.2, 2.4, '#3b4658', STYLE.BLOCK)
    set.addOn(side * (HW + 1.6), H + 3.2, z + 0.6, 2.9, 0.5, 2.9, '#ffd21f', STYLE.SMOOTH)
  }
  set.add(0, H + 2.4, z + 0.6, HW * 2 + 5.8, 1.4, 1.6, '#3b4658', STYLE.BLOCK)
  set.add(0, H + 2.4, z + 1.45, HW * 2 + 2, 0.3, 0.12, theme.accent, STYLE.GLOW)
  set.addOn(0, 0, z + 3.2, 8.6, 0.03, 5.6, '#2b303b', STYLE.SMOOTH)
  for (const dz of [2, 4.2]) {
    for (const side of [-1, 1]) set.add(side * 0.38, 0.06, z + dz, 1.15, 0.04, 0.4, '#ffffff', STYLE.GLOW, -side * 0.75)
  }
  // Where a WIN pad brings you back: a ring on the plaza floor.
  set.addOn(CAGE_RETURN.x, 0, CAGE_RETURN.z, 3.2, 0.02, 3.2, '#ffd21f', STYLE.GLOW, Math.PI / 4)
  set.addOn(CAGE_RETURN.x, 0, CAGE_RETURN.z, 2.7, 0.03, 2.7, '#2b303b', STYLE.SMOOTH, Math.PI / 4)
}

/** Rooms in each of the gauntlet's static chunks: far ones fall outside the view and aren't drawn. */
export const ROOMS_PER_CHUNK = 3

/**
 * Everything in a world's gauntlet that never moves, in chunks of ROOMS_PER_CHUNK rooms
 * (their cages' walls with them), the way in with the first and the gate with the last:
 * one BlockSet each, so the far end - past the fog - costs nothing from the lobby.
 */
export function buildGauntlet(cages) {
  const chunks = []
  for (let from = 0; from < cages.length; from += ROOMS_PER_CHUNK) {
    const set = new BlockSet()
    if (from === 0) addEntrance(set, cages[0])
    for (let i = from; i < Math.min(cages.length, from + ROOMS_PER_CHUNK); i += 1) {
      const theme = cageTheme(cages[i].id)
      addWall(set, i, theme)
      addRoom(set, i, theme)
    }
    if (from + ROOMS_PER_CHUNK >= cages.length) addGate(set, cages.length, cageTheme(cages[cages.length - 1].id))
    chunks.push(set)
  }
  return chunks
}

/**
 * Every cage's four door bars, DOOR_SEGMENTS blocks each, straight up: instance
 * `(cage * 4 + bar) * DOOR_SEGMENTS + segment`, bottom block first.
 */
export function buildDoors(cages) {
  const set = new BlockSet()
  cages.forEach((cage, i) => {
    const theme = cageTheme(cage.id)
    const wz = cageWallZ(i)
    for (const x of DOOR_BARS) {
      for (let s = 0; s < DOOR_SEGMENTS; s += 1) set.add(x, (s + 0.5) * SEGMENT, wz, BAR, SEGMENT, BAR, theme.bars, theme.barStyle)
    }
  })
  return set
}

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _e = new Euler()

/** Overshoots a little and settles: bars bent with a spring in them. */
export const easeOutBack = (t) => {
  const c = 1.9
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

/**
 * How far along a door bar bows, at height `h` (0 the floor, 1 the lintel): most at the
 * height of a player's hands, where it's pulled, nearly as much at the floor (a gap to
 * walk through), none at the top, where the lintel holds it.
 */
const bow = (h) => Math.sin(Math.PI * Math.min(1, (h + 0.64) / 1.64))

/**
 * Places cage `i`'s door bars bent `amount` of the way apart (0 straight, 1 wide open, a
 * little more on the spring of a break): the middle four pulled out to either side,
 * bowing most at hand height, the blocks following the curve - as the hands on them
 * pulled. Returns nothing; marks the matrices for upload.
 */
export function placeDoor(mesh, i, amount) {
  const wz = cageWallZ(i)
  const o = Math.max(0, amount)
  const bend = (k, h) => k * o * bow(h)
  const lean = (h) => -0.5 * o * bow(h)
  DOOR_BARS.forEach((x, b) => {
    const k = Math.sign(x) * DOOR_SPREAD[b]
    for (let s = 0; s < DOOR_SEGMENTS; s += 1) {
      const h0 = s / DOOR_SEGMENTS
      const h1 = (s + 1) / DOOR_SEGMENTS
      const dx = bend(k, h1) - bend(k, h0)
      const dz = lean(h1) - lean(h0)
      const hc = (h0 + h1) / 2
      _p.set(x + bend(k, hc), hc * H, wz + lean(hc))
      _q.setFromEuler(_e.set(-Math.atan2(dz, SEGMENT), 0, -Math.atan2(dx, SEGMENT), 'XYZ'))
      _s.set(BAR, Math.hypot(SEGMENT, dx, dz) + 0.02, BAR)
      mesh.setMatrixAt((i * DOOR_BARS.length + b) * DOOR_SEGMENTS + s, _m.compose(_p, _q, _s))
    }
  })
  mesh.instanceMatrix.needsUpdate = true
}
