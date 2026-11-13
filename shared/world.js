import { WORLDS } from './balance.js'

/**
 * Lobby layout: every gameplay-relevant position and trigger area.
 *
 * Shared by the client (which renders it) and the server (which validates positions
 * against it), so the two can never disagree about where a Train Zone or a cage is.
 *
 * Units are roughly metres - the avatar is 1.8 tall. +X is east, -Z is north, which is
 * "forward" from spawn and the way into the cages.
 *
 * A clean hub: from spawn, wide paved avenues lead straight to every main area, each
 * with a runner in its own colour - north to the gauntlet of cages, west to the Train
 * Zones, east to the body shop, south to the pets (eggs) and the leaderboards behind
 * them, and from the cages' end west to the World 2 portal. The auras and potions
 * stands and the free reward sit in the quarters between.
 *
 * Rects are `{ minX, maxX, minZ, maxZ }` on the ground plane.
 */

export const SPAWN = { x: 0, z: 4 }

/** The flat, walkable plaza. Mountains surround it on every side but the way into the cages. */
export const PLAZA = { minX: -54, maxX: 54, minZ: -38, maxZ: 46 }

// --- The cages ------------------------------------------------------------------------

/**
 * The gauntlet: a long hall of cages running north out of the plaza's north edge, one
 * room after another. Each room is fenced in by bars - its side walls and roof in its
 * own cage's look - and the wall of bars across its south end is its cage: break it to
 * get in. The last room ends in a solid gate.
 *
 * Cage `i` (0 = the first) is the wall at z = cageWallZ(i); room `i` is behind it, from
 * there north to the next cage's wall. On the left of each room (west, as you walk in)
 * is its WIN pad.
 */
export const GAUNTLET = {
  /** Where it starts: the plaza's north edge, which is the first cage's wall. */
  startZ: PLAZA.minZ,
  /** Half its width, inside the side walls. */
  halfWidth: 12,
  /** Each room, wall to wall. */
  roomDepth: 22,
  /** How tall the bars stand (the roof is on them). */
  height: 9,
  /** Half the gap a broken cage's bars bend open: you walk through within this of the middle. */
  doorHalf: 3.4,
  /** Half the thickness of a wall of bars, for collision. */
  wallHalf: 0.4,
}

/** The z of cage `i`'s wall of bars (`i` = the cage count: the solid gate at the end). */
export const cageWallZ = (i) => GAUNTLET.startZ - i * GAUNTLET.roomDepth

/** The middle of room `i` (behind cage `i`), along z. */
export const roomCenterZ = (i) => cageWallZ(i) - GAUNTLET.roomDepth / 2

/** Which room (x, z) is in (-1 in the plaza), for a gauntlet of `count` cages. */
export function roomAt(x, z, count) {
  if (z > GAUNTLET.startZ || Math.abs(x) > GAUNTLET.halfWidth + 1) return -1
  return Math.min(count - 1, Math.floor((GAUNTLET.startZ - z) / GAUNTLET.roomDepth))
}

/**
 * Room `i`'s WIN pad: a big square on the left (west) of the room, halfway down it.
 * Standing on it (or within PAD_SLACK of it) cashes the run in.
 */
export function winPadRect(i) {
  const cz = roomCenterZ(i)
  const minX = -GAUNTLET.halfWidth + 1.6
  return { minX, maxX: minX + 5.4, minZ: cz - 3, maxZ: cz + 3 }
}

/** Whether (x, z) is in front of cage `i`'s bars, close enough to hit them (`slack` to spare). */
export function atCage(i, x, z, reach, slack = 0) {
  const wz = cageWallZ(i)
  return Math.abs(x) <= GAUNTLET.doorHalf + 0.6 + slack && z >= wz - slack && z <= wz + GAUNTLET.wallHalf + reach + 0.6 + slack
}

/**
 * The furthest north (smallest z) you may be with `broken` cages behind you in a
 * gauntlet of `count`: just short of the next whole cage, or of the gate at the end.
 */
export const gauntletLimitZ = (broken, count) => cageWallZ(Math.min(broken, count)) + GAUNTLET.wallHalf

/** A cage's wall where it's still standing across the middle (a dynamic collider until it's broken). */
export function cageDoorRect(i) {
  const wz = cageWallZ(i)
  return { minX: -GAUNTLET.doorHalf, maxX: GAUNTLET.doorHalf, minZ: wz - GAUNTLET.wallHalf, maxZ: wz + GAUNTLET.wallHalf }
}

/** The most cages any world has: how far north the hall is ever built. */
export const MAX_CAGES = Math.max(...WORLDS.map((world) => world.cages.length))

/**
 * Where you're put back after a WIN pad: in the plaza a little short of the first cage,
 * facing it. Faster than walking, so the server lets exactly this trip through once.
 */
export const CAGE_RETURN = { x: 0, z: GAUNTLET.startZ + 12 }

/** Walls that never move: each room's side walls and each cage's bars either side of its middle. */
function gauntletWalls(count) {
  const { halfWidth, doorHalf, wallHalf } = GAUNTLET
  const end = cageWallZ(count)
  const walls = [
    { minX: -halfWidth - 1, maxX: -halfWidth + wallHalf, minZ: end - 1, maxZ: GAUNTLET.startZ + wallHalf },
    { minX: halfWidth - wallHalf, maxX: halfWidth + 1, minZ: end - 1, maxZ: GAUNTLET.startZ + wallHalf },
    // The gate at the far end.
    { minX: -halfWidth, maxX: halfWidth, minZ: end - wallHalf - 1, maxZ: end + wallHalf },
  ]
  for (let i = 0; i < count; i += 1) {
    const wz = cageWallZ(i)
    walls.push({ minX: -halfWidth, maxX: -doorHalf, minZ: wz - wallHalf, maxZ: wz + wallHalf })
    walls.push({ minX: doorHalf, maxX: halfWidth, minZ: wz - wallHalf, maxZ: wz + wallHalf })
  }
  return walls
}

/** The gauntlet's walls for a world of `count` cages (cached: the client asks every world change). */
const wallCache = new Map()
export function gauntletColliders(count) {
  if (!wallCache.has(count)) wallCache.set(count, gauntletWalls(count))
  return wallCache.get(count)
}

/** The gauntlet's floor, as far as any world's runs. */
const GAUNTLET_FLOOR = {
  minX: -GAUNTLET.halfWidth + 0.45,
  maxX: GAUNTLET.halfWidth - 0.45,
  minZ: cageWallZ(MAX_CAGES) + 0.45,
  maxZ: GAUNTLET.startZ + 1,
}

/** Walkable ground; the controller clamps the player into it. */
export const WALKABLE = [PLAZA, GAUNTLET_FLOOR]

// --- The avenues ------------------------------------------------------------------------

/** The paved circle round spawn that the avenues start from. */
export const HUB = { x: SPAWN.x, z: SPAWN.z, radius: 8 }

/**
 * The avenues from the hub to each main area, as rects, by the area they lead to (each
 * painted with a runner in its own colour: see the client's ground.js). Nothing stands
 * on them.
 */
export const AVENUES = [
  { id: 'cages', minX: -4, maxX: 4, minZ: GAUNTLET.startZ, maxZ: SPAWN.z },
  { id: 'training', minX: -37, maxX: 0, minZ: 0, maxZ: 8 },
  { id: 'bodies', minX: 0, maxX: 24, minZ: 0, maxZ: 8 },
  { id: 'pets', minX: -4, maxX: 4, minZ: SPAWN.z, maxZ: 22 },
  { id: 'world2', minX: -27, maxX: -4, minZ: -25, maxZ: -19 },
]

// --- Train Zones ----------------------------------------------------------------------

/**
 * The gym pads line the west side of the plaza in a neat row, one behind the other,
 * the first (free) one nearest the eggs and the best nearest the cages. Each is a small
 * raised pad with a bench down its middle: sit on it to train (see BENCH_X). The gym
 * equipment stands along its west edge.
 */
export const ZONE_COUNT = 7
export const ZONE_PITCH = 7.4
export const ZONE_HALF = { x: 3.6, z: 2.8 }
export const ZONE_X = -44
/** The pad's top, a step up from the plaza. */
export const ZONE_HEIGHT = 0.4
/** The row of equipment along each pad's back (west) edge. */
export const ZONE_RACK_X = ZONE_X - ZONE_HALF.x + 1.1
const ZONE0_Z = 26

export const zoneCenterZ = (index) => ZONE0_Z - index * ZONE_PITCH

/** The pad of Train Zone `index`: standing on it is training. */
export function zoneRect(index) {
  const cz = zoneCenterZ(index)
  return { minX: ZONE_X - ZONE_HALF.x, maxX: ZONE_X + ZONE_HALF.x, minZ: cz - ZONE_HALF.z, maxZ: cz + ZONE_HALF.z }
}

/**
 * Each Train Zone's long training bench, down the middle of its pad and facing the
 * plaza (east): you train sitting on it - anywhere along it, side by side with others -
 * and walking into it sits you down. Its seat runs BENCH_HALF either way of the pad's
 * middle, at x BENCH_X.
 */
export const BENCH_X = ZONE_X + 0.4
export const BENCH_HALF = 2.2
/** How high the seat's top is over the pad. */
export const SEAT_HEIGHT = 0.3
/** Within this of the seat's line, you're on it. */
export const SEAT_REACH = 0.6
/** Facing east, at the plaza: the way you sit on a bench (yaw 0 faces +Z). */
export const SEAT_YAW = Math.PI / 2

/** The Train Zone whose bench is at (x, z) (with `slack` to spare all round), or -1. */
export function benchAt(x, z, slack = 0) {
  if (Math.abs(x - BENCH_X) > SEAT_REACH + slack) return -1
  for (let i = 0; i < ZONE_COUNT; i += 1) {
    if (Math.abs(z - zoneCenterZ(i)) <= BENCH_HALF + slack) return i
  }
  return -1
}

/** Where along Train Zone `zone`'s bench you sit, getting on at z: on the seat, not past its ends. */
export const benchSeatZ = (zone, z) =>
  Math.min(zoneCenterZ(zone) + BENCH_HALF - 0.3, Math.max(zoneCenterZ(zone) - BENCH_HALF + 0.3, z))

/** The pad and the dark rim round it: what a locked zone walls off. */
export function zoneDeckRect(index) {
  const r = zoneRect(index)
  return { minX: r.minX - 0.4, maxX: r.maxX + 0.4, minZ: r.minZ - 0.4, maxZ: r.maxZ + 0.4 }
}

// --- Body shop ------------------------------------------------------------------------

/**
 * The body shop: an open-air yard east of the plaza with two display stages, the first
 * twelve bodies on the low front one and the next twelve on the higher back one, and a big BODIES
 * sign behind. Both stages are low enough to walk straight onto.
 */
export const SHOP = { minX: 24, maxX: 50, minZ: -26, maxZ: 12 }
export const SHOP_STAGES = [
  { minX: 25.5, maxX: 36, minZ: -25, maxZ: 11, height: 0.5 },
  { minX: 38.5, maxX: 49, minZ: -25, maxZ: 11, height: 1 },
]
/** The sign along the back (east) edge, facing the plaza, high enough to clear the labels. */
export const SHOP_SIGN = { x: 50.6, minZ: -23, maxZ: 9, top: 16 }
export const PAD_SIZE = 4.4

/** Rows of display stands, nearest the plaza first: two rows on each stage. */
const PAD_ROWS_X = [28, 33.5, 41, 46.5]

/**
 * Twenty-four stands, one for each body (BODIES), six to a row 6 m apart. `row` (0-3,
 * front to back) lets the labels above them step up so nearer ones don't hide farther
 * ones.
 */
export const BODY_PADS = Array.from({ length: 24 }, (_, i) => {
  const row = Math.floor(i / 6)
  return {
    index: i,
    row,
    x: PAD_ROWS_X[row],
    z: (SHOP.minZ + SHOP.maxZ) / 2 - 15 + (i % 6) * 6,
    y: SHOP_STAGES[row < 2 ? 0 : 1].height,
  }
})

export const padRect = (pad) => ({
  minX: pad.x - PAD_SIZE / 2,
  maxX: pad.x + PAD_SIZE / 2,
  minZ: pad.z - PAD_SIZE / 2,
  maxZ: pad.z + PAD_SIZE / 2,
})

// --- Eggs, stands, boards -------------------------------------------------------------

/** The pets: the egg row at the end of the south avenue, either side of it; the leaderboards behind. */
export const EGG_STANDS = [
  { eggId: 'basic', x: -18, z: 28 },
  { eggId: 'meadow', x: -9, z: 28 },
  { eggId: 'sunset', x: 9, z: 28 },
  { eggId: 'unicorn', x: 18, z: 28 },
  { eggId: 'demon', x: 28, z: 29, big: true },
]
export const EGG_TRIGGER_RADIUS = 4.2

/** Limited premium pet on display, beside the eggs. */
export const SPHINX_STAND = { x: 40, z: 29 }

export const LEADERBOARDS = [
  { id: 'rebirths', x: -16, z: 40 },
  { id: 'strength', x: 0, z: 40 },
  { id: 'cages', x: 16, z: 40 },
]

/**
 * The World 2 (Shadow Prison) portal, north-west by the way into the cages, at the end of
 * its own avenue. Name and Wins are WORLD_PORTALS in balance.js.
 */
export const PORTALS = [{ id: 'shadow', x: -31, z: -29, radius: 3.6 }]

/** The aura stand and the potion stand: walk up to them to open their panels. */
export const AURA_STAND = { x: 31, z: -32, radius: 3.6 }
export const POTION_STAND = { x: -20, z: 17, radius: 3.6 }

/** The big buff statue by the way into the cages, asking if you can escape. */
export const STATUE = { x: 19, z: -33 }

export const FREE_REWARD = { x: 13, z: 16, radius: 3 }

// --- Collision ----------------------------------------------------------------------

const box = (x, z, halfX, halfZ) => ({
  minX: x - halfX,
  maxX: x + halfX,
  minZ: z - halfZ,
  maxZ: z + halfZ,
})

/** Solid, never-changing obstacles. Locked Train Zones add their own walls at runtime. */
export const STATIC_COLLIDERS = [
  // The shop's sign.
  { minX: SHOP_SIGN.x - 0.5, maxX: SHOP_SIGN.x + 0.5, minZ: SHOP_SIGN.minZ - 0.5, maxZ: SHOP_SIGN.maxZ + 0.5 },
  // Egg pedestals.
  ...EGG_STANDS.map((s) => box(s.x, s.z, s.big ? 2.1 : 1.6, s.big ? 2.1 : 1.6)),
  box(SPHINX_STAND.x, SPHINX_STAND.z, 3, 3),
  ...LEADERBOARDS.map((b) => box(b.x, b.z, 4.6, 0.5)),
  box(FREE_REWARD.x, FREE_REWARD.z, 1.4, 1.4),
  // Each portal ring's base; the swirl itself is walk-through.
  ...PORTALS.flatMap((p) => [box(p.x - p.radius, p.z, 0.6, 0.8), box(p.x + p.radius, p.z, 0.6, 0.8)]),
  // The stands' counters.
  box(AURA_STAND.x, AURA_STAND.z - 1.2, 2.95, 0.8),
  box(AURA_STAND.x, AURA_STAND.z - 3.5, 4.4, 0.45),
  box(POTION_STAND.x - 1.2, POTION_STAND.z, 0.9, 2.6),
  box(STATUE.x, STATUE.z, 2.2, 2.2),
  // The cliffs either side of the way into the cages.
  { minX: PLAZA.minX, maxX: -GAUNTLET.halfWidth, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
  { minX: GAUNTLET.halfWidth, maxX: PLAZA.maxX, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
  // Each Train Zone's row of equipment.
  ...Array.from({ length: ZONE_COUNT }, (_, i) => box(ZONE_RACK_X, zoneCenterZ(i), 0.8, ZONE_HALF.z - 0.6)),
]

/** Raised floors the player stands on, as rects with a height. */
export const PLATFORMS = [
  ...SHOP_STAGES.map((s) => ({ ...s })),
  ...Array.from({ length: ZONE_COUNT }, (_, i) => ({ ...zoneDeckRect(i), height: ZONE_HEIGHT })),
]

// --- Helpers ------------------------------------------------------------------------

export const inRect = (r, x, z, margin = 0) =>
  x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin

/** Index of the Train Zone whose pad is under (x, z), or -1. */
export function zoneAt(x, z, margin = 0) {
  for (let i = 0; i < ZONE_COUNT; i += 1) {
    if (inRect(zoneRect(i), x, z, margin)) return i
  }
  return -1
}

/** The portal whose swirl (x, z) is in, give or take `margin`, or null. */
export function portalAt(x, z, margin = 0) {
  for (const p of PORTALS) {
    if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return p
  }
  return null
}

/** Whether (x, z) is where you land back in the lobby after a WIN pad (give or take a little). */
export const atCageReturn = (x, z) => Math.hypot(x - CAGE_RETURN.x, z - CAGE_RETURN.z) < 3

/** Index of the body shop pad under (x, z), or -1. */
export function padAt(x, z) {
  for (const pad of BODY_PADS) {
    if (inRect(padRect(pad), x, z)) return pad.index
  }
  return -1
}

/** The egg stand within reach of (x, z), or null. */
export function eggStandNear(x, z) {
  for (const stand of EGG_STANDS) {
    const reach = EGG_TRIGGER_RADIUS + (stand.big ? 1 : 0)
    if (Math.hypot(stand.x - x, stand.z - z) <= reach) return stand
  }
  return null
}

/** Height of the floor at (x, z): raised platforms, else the ground at 0 (the gauntlet's floor too). */
export function groundHeightAt(x, z) {
  let h = 0
  for (const p of PLATFORMS) {
    if (p.height > h && inRect(p, x, z)) h = p.height
  }
  return h
}

/** Clamps (x, z) into the walkable union, returning the nearest walkable point. */
export function clampToWalkable(x, z, out = { x: 0, z: 0 }) {
  let best = Infinity
  for (const r of WALKABLE) {
    const cx = Math.min(r.maxX, Math.max(r.minX, x))
    const cz = Math.min(r.maxZ, Math.max(r.minZ, z))
    const d = (cx - x) ** 2 + (cz - z) ** 2
    if (d < best) {
      best = d
      out.x = cx
      out.z = cz
      if (d === 0) break
    }
  }
  return out
}

/** Fastest a player can legitimately move, for the server's anti-teleport check. */
export const MAX_MOVE_SPEED = 14
