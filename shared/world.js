/**
 * Lobby layout: every gameplay-relevant position and trigger area.
 *
 * Shared by the client (which renders it) and the server (which validates positions
 * against it), so the two can never disagree about where a Train Zone or the boulder is.
 *
 * Units are roughly metres - the avatar is 1.8 tall. +X is east, -Z is north, which is
 * "forward" from spawn and the way up the mountain.
 *
 * Seen from spawn: the boulder and the track climbing between the cliffs straight ahead
 * (north), the Train Zones along the left (west) side, the dumbbell shop on the right
 * (east), eggs and leaderboards behind.
 *
 * Rects are `{ minX, maxX, minZ, maxZ }` on the ground plane.
 */

export const SPAWN = { x: 0, z: 3 }

/** The flat, walkable plaza. Mountains surround it on every side but the track. */
export const PLAZA = { minX: -46, maxX: 46, minZ: -38, maxZ: 34 }

// --- The boulder track ----------------------------------------------------------------

/**
 * The foot of the mountain: the plaza's north edge, where the track starts climbing.
 * Track metre m is m metres up the slope from here.
 */
export const TRACK_START_Z = PLAZA.minZ
/** How steeply the track climbs: about 8 degrees. */
export const SLOPE_ANGLE = 0.14
/** Half the width of the track's floor, between its walls: narrow, as in the reference. */
export const TRACK_HALF_WIDTH = 3.8

/**
 * The PUSH ZONE in front of the first boulder, at the foot of the track: walking onto it
 * starts a push.
 */
export const PUSH_ZONE = { minX: -3.4, maxX: 3.4, minZ: TRACK_START_Z, maxZ: TRACK_START_Z + 5 }
/** Where you're put back after a push: a little way short of the zone, facing it. */
export const PUSH_RETURN = { x: 0, z: TRACK_START_Z + 13 }
/**
 * The boulder waiting at the start (its middle), and its radius on the ground: where the
 * client draws the first stage's (PUSH_START + its radius + 0.55 up the track).
 */
export const START_BOULDER = { x: 0, z: TRACK_START_Z + 0.45, radius: 1.5 }

/** Walkable ground; the controller clamps the player into it. Nothing up the track. */
export const WALKABLE = [PLAZA]

// --- Train Zones ----------------------------------------------------------------------

/**
 * The gym pads line the west side of the plaza, one behind the other, nearest spawn
 * first. Each is a raised pad with a long bench down its middle: sit on it to train
 * (see BENCH_X). The gym equipment stands along its west edge.
 */
export const ZONE_COUNT = 7
export const ZONE_PITCH = 9.6
export const ZONE_HALF = { x: 6, z: 4 }
export const ZONE_X = -35
/** The pad's top, a step up from the plaza. */
export const ZONE_HEIGHT = 0.4
/** The row of equipment along each pad's back (west) edge. */
export const ZONE_RACK_X = ZONE_X - ZONE_HALF.x + 1.1
const ZONE0_Z = 28

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
export const BENCH_HALF = 3.2
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

// --- Dumbbell shop --------------------------------------------------------------------

/**
 * The dumbbell shop: an open-air yard east of the plaza with two display stages, the
 * first ten dumbbells on the low front one and the next ten on the higher back one, and
 * a big DUMBBELLS sign behind. Both stages are low enough to walk straight onto.
 */
export const SHOP = { minX: 16, maxX: 42, minZ: -26, maxZ: 12 }
export const SHOP_STAGES = [
  { minX: 17.5, maxX: 28, minZ: -25, maxZ: 11, height: 0.5 },
  { minX: 30.5, maxX: 41, minZ: -25, maxZ: 11, height: 1 },
]
/** The sign along the back (east) edge, facing the plaza, high enough to clear the labels. */
export const SHOP_SIGN = { x: 42.6, minZ: -23, maxZ: 9, top: 16 }
export const PAD_SIZE = 4.4

/** Rows of display stands, nearest the plaza first: two rows on each stage. */
const PAD_ROWS_X = [20, 25.5, 33, 38.5]

/**
 * Twenty stands, five to a row 7 m apart. `row` (0-3, front to back) lets the labels
 * above them step up so nearer ones don't hide farther ones.
 */
export const DUMBBELL_PADS = Array.from({ length: 20 }, (_, i) => {
  const row = Math.floor(i / 5)
  return {
    index: i,
    row,
    x: PAD_ROWS_X[row],
    z: (SHOP.minZ + SHOP.maxZ) / 2 - 14 + (i % 5) * 7,
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

/** The egg row stands behind spawn, the leaderboards behind it. */
export const EGG_STANDS = [
  { eggId: 'basic', x: -12, z: 21 },
  { eggId: 'meadow', x: -4, z: 21 },
  { eggId: 'sunset', x: 4, z: 21 },
  { eggId: 'unicorn', x: 12, z: 21 },
  { eggId: 'demon', x: 21, z: 22, big: true },
]
export const EGG_TRIGGER_RADIUS = 4.2

/** Limited premium pet on display. */
export const SPHINX_STAND = { x: 37, z: 21 }

export const LEADERBOARDS = [
  { id: 'rebirths', x: -12, z: 30 },
  { id: 'muscle', x: 0, z: 30 },
  { id: 'height', x: 12, z: 30 },
]

/** The Future World portal, out past the shop. Name and Wins are WORLD_PORTALS in balance.js. */
export const PORTALS = [{ id: 'future', x: 28, z: -31, radius: 3.6 }]

/** The aura stand and the potion stand: walk up to them to open their panels. */
export const AURA_STAND = { x: -19, z: -28, radius: 3.6 }
export const POTION_STAND = { x: -19, z: 7, radius: 3.6 }

/** The big buff statue by the boulder, asking if you can reach the top. */
export const STATUE = { x: 12, z: -34 }

export const FREE_REWARD = { x: 10, z: 7, radius: 3 }
export const WATERFALL = { x: 38, z: -38 }

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
  // The boulder waiting at the start.
  box(START_BOULDER.x, START_BOULDER.z, START_BOULDER.radius - 0.2, START_BOULDER.radius - 0.5),
  // The cliffs either side of the track's foot.
  { minX: PLAZA.minX, maxX: -TRACK_HALF_WIDTH - 1, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
  { minX: TRACK_HALF_WIDTH + 1, maxX: PLAZA.maxX, minZ: PLAZA.minZ - 1, maxZ: PLAZA.minZ + 0.6 },
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

export const inPushZone = (x, z, margin = 0) => inRect(PUSH_ZONE, x, z, margin)

/** The portal whose swirl (x, z) is in, give or take `margin`, or null. */
export function portalAt(x, z, margin = 0) {
  for (const p of PORTALS) {
    if (Math.hypot(x - p.x, z - p.z) < p.radius + margin) return p
  }
  return null
}

/**
 * Whether a move from `from` to `to` is the trip back after a push: off the push zone
 * onto PUSH_RETURN. Faster than walking, so the server's speed check lets exactly this
 * one through.
 */
export const isPushReturn = (from, to) =>
  inPushZone(from.x, from.z, 2) && Math.hypot(to.x - PUSH_RETURN.x, to.z - PUSH_RETURN.z) < 2.5

/** Index of the dumbbell pad under (x, z), or -1. */
export function padAt(x, z) {
  for (const pad of DUMBBELL_PADS) {
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

/** Height of the floor at (x, z): raised platforms, else the ground at 0. */
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
