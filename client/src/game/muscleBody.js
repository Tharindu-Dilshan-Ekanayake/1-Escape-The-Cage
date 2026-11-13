import { BoxGeometry, BufferAttribute, BufferGeometry } from 'three'

/**
 * The game's own body, as in the reference: smooth, rounded arms, legs and torso in
 * place of the avatar's boxes - skinny for a new player, a bodybuilder in the end.
 *
 * Each part is built from its box in player.glb: every face becomes a grid, and every
 * grid point is pushed out from the box onto a rounded tube whose radius changes along
 * the part (hand to shoulder, foot to hip, waist to chest), with domed ends. The grid
 * keeps the box face's texture mapping, so the avatar's clothes and skin land where
 * they always did. It's built twice - skinny and bodybuilder - and the bodybuilder is a
 * morph target: how built someone is (playerPose.bulkFor) is one morph influence, done
 * on the GPU, with no geometry work as they level up.
 *
 * Profiles are keyframes up the part, from its bottom (t 0) to its top (t 1):
 * [t, inner half-width, outer half-width, front, back, out], in the rig's bind-pose
 * units (the whole avatar is 6.4 tall, its parts' boxes 2.4). Each cross-section is four
 * quarter-ellipses - towards the body and away from it, in front and behind - so a
 * muscle can bulge on one side only: a bicep in front, a tricep behind, a forearm on its
 * outside. `out` moves the whole section away from the body's middle. The torso and legs
 * are written [t, half-width, half-depth, out, forward] (see symmetric).
 */

/**
 * Muscles, on the bodybuilder shape only: bumps standing out of its section, each
 * [angle, t, height, angular width, width along], summed. The angle goes round the part:
 * on an arm or leg 0 is straight out from the body, PI/2 the front, PI the inside, -PI/2
 * the back; on the torso 0 is its left side (+x), PI/2 the front, PI its right, -PI/2 the
 * back. A negative height is a groove (the spine). Muscles show as the body builds,
 * in the geometry itself: the sun lights them and the body's shine picks them out.
 */
const PEC = 0.45
const TORSO_LOBES = [
  // Pecs: a slab either side of the breastbone.
  [Math.PI / 2 - PEC, 0.79, 0.15, 0.36, 0.085],
  [Math.PI / 2 + PEC, 0.79, 0.15, 0.36, 0.085],
  // The six-pack: three pairs down the front, between the lines drawn on it (bodies.js).
  ...[0.21, 0.33, 0.45].flatMap((t) => [
    [Math.PI / 2 - 0.2, t, 0.075, 0.16, 0.05],
    [Math.PI / 2 + 0.2, t, 0.075, 0.16, 0.05],
  ]),
  // Lats flaring out under the arms, either side towards the back.
  [-0.32, 0.63, 0.13, 0.48, 0.13],
  [Math.PI + 0.32, 0.63, 0.13, 0.48, 0.13],
  // Obliques low on the sides.
  [0.2, 0.22, 0.05, 0.35, 0.08],
  [Math.PI - 0.2, 0.22, 0.05, 0.35, 0.08],
  // Traps and the upper back, and the spine's groove down the middle.
  [-Math.PI / 2 - 0.45, 0.92, 0.09, 0.45, 0.07],
  [-Math.PI / 2 + 0.45, 0.92, 0.09, 0.45, 0.07],
  [-Math.PI / 2, 0.6, -0.06, 0.08, 0.3],
]
const ARM_LOBES = [
  // The bicep's peak, in front.
  [Math.PI / 2, 0.71, 0.1, 0.55, 0.075],
  // The tricep's horseshoe: two heads behind.
  [-Math.PI / 2 - 0.35, 0.72, 0.075, 0.35, 0.09],
  [-Math.PI / 2 + 0.35, 0.72, 0.075, 0.35, 0.09],
  // The deltoid's three heads round the shoulder.
  [Math.PI / 2 - 0.5, 0.93, 0.08, 0.5, 0.055],
  [0, 0.94, 0.09, 0.55, 0.055],
  [-0.65, 0.93, 0.07, 0.5, 0.055],
  // The forearm's swell on its outside, under the elbow.
  [0.6, 0.39, 0.075, 0.5, 0.09],
]
const LEG_LOBES = [
  // The quads: the outer sweep, the teardrop above the inside of the knee, the middle.
  [0.35, 0.76, 0.1, 0.6, 0.12],
  [Math.PI - 0.6, 0.6, 0.1, 0.45, 0.06],
  [Math.PI / 2, 0.8, 0.06, 0.5, 0.1],
  // The calf's two heads, behind.
  [-Math.PI / 2 - 0.45, 0.28, 0.09, 0.4, 0.07],
  [-Math.PI / 2 + 0.45, 0.28, 0.09, 0.4, 0.07],
  // The glute, at the top behind.
  [-Math.PI / 2, 0.98, 0.08, 0.6, 0.06],
]

/** How much the muscles push out at angle `phi`, height `t`. */
function lobeAt(lobes, phi, t) {
  let d = 0
  for (const [p0, t0, height, wp, wt] of lobes) {
    const dp = Math.atan2(Math.sin(phi - p0), Math.cos(phi - p0)) / wp
    const dt = (t - t0) / wt
    d += height * Math.exp(-dp * dp - dt * dt)
  }
  return d
}

/** [t, half-width, half-depth, out, forward] keys as the four-sided kind: the same both sides, shifted forward. */
const symmetric = (keys) => keys.map(([t, w, d, out, forward]) => [t, w, w, d + forward, d - forward, out])

const SHAPES = {
  torso: {
    bones: 1,
    around: [6, 4],
    along: 12,
    skinny: {
      keys: symmetric([
        [0, 0.72, 0.42, 0, 0],
        [0.25, 0.66, 0.4, 0, 0.01],
        [0.55, 0.64, 0.38, 0, 0.01],
        [0.8, 0.8, 0.43, 0, 0.02],
        [0.94, 0.78, 0.42, 0, 0],
        [1, 0.62, 0.38, 0, 0],
      ]),
      top: 0.12,
      bottom: 0.08,
    },
    // A bodybuilder's V: a tight waist over the belt, abs a little proud of it, the lats
    // sweeping out under the arms to a chest as broad as it gets, the pecs standing out in
    // front over them, a thick back behind, and traps rising to the neck.
    buff: {
      keys: [
        [0, 1.0, 1.0, 0.74, 0.72, 0],
        [0.12, 0.94, 0.94, 0.77, 0.7, 0],
        [0.3, 1.02, 1.02, 0.86, 0.74, 0],
        [0.48, 1.26, 1.26, 0.92, 0.86, 0],
        [0.64, 1.62, 1.62, 1.08, 0.97, 0],
        [0.76, 1.84, 1.84, 1.24, 1.0, 0],
        [0.88, 1.82, 1.82, 1.12, 1.02, 0],
        [1, 1.32, 1.32, 0.82, 0.88, 0],
      ],
      top: 0.42,
      bottom: 0.15,
      lobes: TORSO_LOBES,
    },
  },
  arm: {
    bones: 2,
    around: [4, 4],
    along: 18,
    // A plain, thin arm: fist, wrist, forearm, elbow, upper arm, shoulder.
    skinny: {
      keys: [
        [0, 0.24, 0.26, 0.27, 0.27, 0],
        [0.06, 0.25, 0.27, 0.28, 0.27, 0],
        [0.13, 0.2, 0.21, 0.21, 0.21, 0],
        [0.3, 0.23, 0.25, 0.25, 0.24, 0],
        [0.5, 0.21, 0.22, 0.22, 0.22, 0],
        [0.7, 0.24, 0.25, 0.27, 0.25, 0],
        [0.88, 0.29, 0.31, 0.3, 0.3, 0],
        [1, 0.27, 0.27, 0.27, 0.27, 0],
      ],
      top: 0.14,
      bottom: 0.12,
    },
    // A bodybuilder's arm, heroic but true to life: a solid fist on a narrow wrist; a
    // forearm swelling to its outside just under a tight elbow; above it a bicep that
    // peaks out in front over a horseshoe of tricep behind; a groove; and a round
    // deltoid capping the shoulder and standing out from it.
    buff: {
      keys: [
        [0, 0.4, 0.43, 0.44, 0.42, 0],
        [0.07, 0.44, 0.47, 0.5, 0.46, 0],
        [0.14, 0.31, 0.34, 0.33, 0.32, 0],
        [0.24, 0.44, 0.53, 0.48, 0.46, 0.02],
        [0.36, 0.55, 0.69, 0.6, 0.58, 0.05],
        [0.46, 0.5, 0.58, 0.52, 0.53, 0.03],
        [0.53, 0.39, 0.43, 0.41, 0.45, 0],
        [0.61, 0.55, 0.6, 0.7, 0.64, 0],
        [0.71, 0.66, 0.7, 0.93, 0.72, 0.02],
        [0.8, 0.64, 0.69, 0.8, 0.71, 0.03],
        [0.86, 0.6, 0.7, 0.66, 0.66, 0.06],
        [0.93, 0.72, 0.89, 0.8, 0.78, 0.1],
        [1, 0.58, 0.66, 0.62, 0.62, 0.06],
      ],
      top: 0.32,
      bottom: 0.22,
      lobes: ARM_LOBES,
    },
  },
  leg: {
    bones: 2,
    around: [3, 3],
    along: 12,
    // Foot, ankle, calf, knee, thigh, hip.
    skinny: {
      keys: symmetric([
        [0, 0.3, 0.36, 0, 0.1],
        [0.08, 0.22, 0.24, 0, 0.02],
        [0.3, 0.27, 0.29, 0, -0.03],
        [0.5, 0.24, 0.25, 0, 0],
        [0.78, 0.3, 0.31, 0, 0.01],
        [1, 0.36, 0.38, 0, 0],
      ]),
      top: 0.1,
      bottom: 0,
    },
    // A bodybuilder's legs: a calf bulging out behind and to the side over a narrow
    // ankle, a tight knee, then the quads - a teardrop above the inside of the knee,
    // sweeping out wide and forward up the thigh - into a solid hip.
    buff: {
      keys: [
        [0, 0.5, 0.55, 0.74, 0.5, 0],
        [0.08, 0.38, 0.42, 0.42, 0.42, 0],
        [0.24, 0.48, 0.6, 0.5, 0.74, 0.02],
        [0.4, 0.44, 0.5, 0.48, 0.56, 0],
        [0.5, 0.42, 0.45, 0.5, 0.46, 0],
        [0.6, 0.62, 0.62, 0.74, 0.6, 0],
        [0.78, 0.7, 0.84, 0.88, 0.74, 0.04],
        [1, 0.74, 0.78, 0.76, 0.78, 0],
      ],
      top: 0.15,
      bottom: 0,
      lobes: LEG_LOBES,
    },
  },
}

/**
 * Each body part: its shape, which way is out (+X is the avatar's left), its bones top
 * first, and its number in the body's `aMuscle` attribute (0 is the head: see bodies.js).
 */
const PARTS = {
  torso: { shape: 'torso', side: 0, bones: ['Spine1'], code: 2 },
  arm_L: { shape: 'arm', side: 1, bones: ['ArmL1', 'ArmL2'], code: 1 },
  arm_R: { shape: 'arm', side: -1, bones: ['ArmR1', 'ArmR2'], code: 1 },
  leg_L: { shape: 'leg', side: 1, bones: ['LegL1', 'LegL2'], code: 3 },
  leg_R: { shape: 'leg', side: -1, bones: ['LegR1', 'LegR2'], code: 3 },
}
export const MUSCLE_SLOTS = Object.keys(PARTS)

/**
 * How finely your own avatar's parts are divided (others' keep their shapes' own, coarser
 * division): it's always close to the camera, and fine enough for its muscles to stand
 * out in the geometry. About 5.5k triangles, against 2.4k.
 */
export const HERO_DETAIL = { torso: { along: 20, around: [10, 6] }, arm: { along: 24, around: [6, 6] }, leg: { along: 18, around: [5, 5] } }

/** A part's own entry in a detail table keyed by shape (like HERO_DETAIL), or null. */
export const partDetail = (slot, detail) => detail?.[PARTS[slot]?.shape] ?? null

/**
 * How far the arms' roots (shoulders) and legs' (hips) move out from the avatar's own,
 * so the limbs stay at the sides of the body however broad it is, and how tall it
 * stands: [skinny, bodybuilder], blended like the body's morph - and the shoulders a
 * further `armOut` as the arms themselves grow, so they sit snug against the chest.
 */
export const BODY_OFFSETS = { shoulder: [-0.84, 0.2], hip: [-0.32, 0.05], tall: [0.95, 1.12], armOut: 0.45 }

/** How far a shoulder moves out for a body `built` (0-1) with arms `armBuilt` (0-1). */
export const shoulderOffset = (built, armBuilt) =>
  BODY_OFFSETS.shoulder[0] + (BODY_OFFSETS.shoulder[1] - BODY_OFFSETS.shoulder[0]) * built + BODY_OFFSETS.armOut * armBuilt

/**
 * How much of each box face's texture the rounded part shows, from the face's middle:
 * a hair less than all of it, so its edges never pick up the neighbouring face's pixels
 * (seen as dark lines along a smooth arm, where a box hid them in its corners).
 */
const UV_INSET = 0.97

/** Catmull-Rom through the keys' column `c` at t. */
function profile(keys, t, c) {
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1][0]) i += 1
  const a = keys[Math.max(0, i - 1)][c]
  const b = keys[i][c]
  const d = keys[i + 1][c]
  const e = keys[Math.min(keys.length - 1, i + 2)][c]
  const u = Math.min(1, Math.max(0, (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0])))
  return b + 0.5 * u * (d - a + u * (2 * a - 5 * b + 4 * d - e + u * (3 * (b - d) + e - a)))
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The box faces: which axis they face along, which way, and their in-plane axes [a, b]. */
const FACES = [
  { axis: 'z', dir: 1, a: 'x', b: 'y' },
  { axis: 'z', dir: -1, a: 'x', b: 'y' },
  { axis: 'x', dir: 1, a: 'z', b: 'y' },
  { axis: 'x', dir: -1, a: 'z', b: 'y' },
  { axis: 'y', dir: 1, a: 'x', b: 'z' },
  { axis: 'y', dir: -1, a: 'x', b: 'z' },
]

/**
 * Each box face's texture mapping, as an affine map from its in-plane coordinates to
 * uv - fitted to the face's vertices, so any layout the part's UVs use carries over.
 */
function faceMaps(geometry) {
  const pos = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  return FACES.map((face) => {
    const rows = []
    for (let i = 0; i < pos.count; i += 1) {
      const n = { x: normal.getX(i), y: normal.getY(i), z: normal.getZ(i) }
      if (n[face.axis] * face.dir < 0.9) continue
      const p = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) }
      rows.push([p[face.a], p[face.b], uv.getX(i), uv.getY(i)])
    }
    return [fitAffine(rows, 2), fitAffine(rows, 3)]
  })
}

/** Least-squares c0 + c1*a + c2*b through rows [a, b, ...values] for column `col`. */
function fitAffine(rows, col) {
  if (rows.length < 3) return [rows[0]?.[col] ?? 0, 0, 0]
  // Normal equations, 3x3, solved by Cramer's rule.
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, sv = 0, sav = 0, sbv = 0
  for (const r of rows) {
    const [a, b] = r
    const v = r[col]
    n += 1
    sa += a
    sb += b
    saa += a * a
    sbb += b * b
    sab += a * b
    sv += v
    sav += a * v
    sbv += b * v
  }
  const det3 = (m) =>
    m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  const m = [n, sa, sb, sa, saa, sab, sb, sab, sbb]
  const d = det3(m)
  if (Math.abs(d) < 1e-9) return [sv / n, 0, 0]
  const c0 = det3([sv, sa, sb, sav, saa, sab, sbv, sab, sbb]) / d
  const c1 = det3([n, sv, sb, sa, sav, sab, sb, sbv, sbb]) / d
  const c2 = det3([n, sa, sv, sa, saa, sav, sb, sab, sbv]) / d
  return [c0, c1, c2]
}

/**
 * Built parts, by slot, bones and box: every avatar is a copy of the same player.glb,
 * so each part is built once a session and shared (callers clone what they keep).
 */
const built = new Map()

/**
 * Body part `slot` (a key of PARTS) for its box geometry `source`: a smooth,
 * non-indexed, skinned geometry - skinny, with the bodybuilder as its one (relative)
 * morph target - in the same space as the box, with `aMuscle` (its part's number, and
 * where on the part each point is: across and front -1..1, up 0..1) for the body's
 * muscle definition. `boneIndex(name)` gives a bone's skin index. `detail` overrides how
 * finely it's divided - `{ along, around }`, as SHAPES has them (the body shop shows two
 * dozen at once, more coarsely). Shared: clone it to keep it. Returns null for a slot
 * that isn't a body part.
 */
export function buildMusclePart(slot, source, boneIndex, detail = null) {
  const part = PARTS[slot]
  if (!part) return null
  source.computeBoundingBox()
  const { min, max } = source.boundingBox
  const bones = part.bones.map(boneIndex)
  const key = [slot, detail?.along ?? 0, detail?.around?.join(',') ?? '', ...bones, ...min.toArray(), ...max.toArray()].join('|')
  if (!built.has(key)) built.set(key, buildPart(part, source, bones, detail))
  return built.get(key)
}

function buildPart(part, source, bones, detail) {
  const base = SHAPES[part.shape]
  const shape = { ...base, along: detail?.along || base.along, around: detail?.around || base.around }
  const { min, max } = source.boundingBox
  const cx = (min.x + max.x) / 2
  const cz = (min.z + max.z) / 2
  const hx = (max.x - min.x) / 2
  const hz = (max.z - min.z) / 2
  const y0 = min.y
  const y1 = max.y
  const maps = faceMaps(source)

  const builds = [shape.skinny, shape.buff]
  const positions = [[], []]
  const uvs = []
  const muscle = []
  const skinIndex = []
  const skinWeight = []
  const index = []
  const p = { x: 0, y: 0, z: 0 }

  FACES.forEach((face, f) => {
    // Grid resolution: across the face (its in-plane a axis) and along b.
    const nA = face.a === 'x' ? shape.around[0] : shape.around[1]
    const nB = face.b === 'y' ? shape.along : shape.around[1]
    const lo = { x: min.x, y: min.y, z: min.z }
    const hi = { x: max.x, y: max.y, z: max.z }
    const first = uvs.length / 2
    for (let j = 0; j <= nB; j += 1) {
      for (let i = 0; i <= nA; i += 1) {
        p[face.axis] = face.dir > 0 ? hi[face.axis] : lo[face.axis]
        p[face.a] = lo[face.a] + ((hi[face.a] - lo[face.a]) * i) / nA
        p[face.b] = lo[face.b] + ((hi[face.b] - lo[face.b]) * j) / nB
        const [mu, mv] = maps[f]
        const midA = (lo[face.a] + hi[face.a]) / 2
        const midB = (lo[face.b] + hi[face.b]) / 2
        const a = midA + (p[face.a] - midA) * UV_INSET
        const b = midB + (p[face.b] - midB) * UV_INSET
        uvs.push(mu[0] + mu[1] * a + mu[2] * b, mv[0] + mv[1] * a + mv[2] * b)

        // Onto the rounded tube: the box point's angle round the part, and how far out.
        const u = (p.x - cx) / hx
        const v = (p.z - cz) / hz
        const rho = Math.max(Math.abs(u), Math.abs(v))
        const theta = Math.atan2(v, u)
        const t = Math.min(1, Math.max(0, (p.y - y0) / (y1 - y0)))
        const cap = face.axis === 'y' ? face.dir : 0
        // Which quarter of the section: towards the body or away, in front or behind.
        const outward = part.side !== 0 && u * part.side > 0
        // The angle round the part the muscles are laid out by (see TORSO_LOBES).
        const phi = part.side !== 0 ? Math.atan2(v, u * part.side) : theta
        builds.forEach((build, k) => {
          const rx = profile(build.keys, t, outward ? 2 : 1)
          const rz = profile(build.keys, t, v > 0 ? 3 : 4)
          const dome = cap > 0 ? build.top : cap < 0 ? -build.bottom : 0
          const muscle = build.lobes ? rho * lobeAt(build.lobes, phi, t) : 0
          positions[k].push(
            cx + part.side * profile(build.keys, t, 5) + (rho * rx + muscle) * Math.cos(theta),
            p.y + dome * (1 - rho * rho),
            cz + (rho * rz + muscle) * Math.sin(theta),
          )
        })

        muscle.push(part.code, u, v, t)

        // A limb bends between its two bones round the middle (elbow, knee).
        const upper = bones.length > 1 ? smoothstep(0.4, 0.6, t) : 1
        skinIndex.push(bones[0], bones[1] ?? bones[0], 0, 0)
        skinWeight.push(upper, 1 - upper, 0, 0)
      }
    }
    // Two triangles a cell, wound to face out of the box: a cell's a x b points along
    // +z on a z face, but along -x on an x face and -y on a y face.
    const row = nA + 1
    const flip = face.axis === 'z' ? face.dir < 0 : face.dir > 0
    for (let j = 0; j < nB; j += 1) {
      for (let i = 0; i < nA; i += 1) {
        const q = first + j * row + i
        if (flip) index.push(q, q + row, q + 1, q + 1, q + row, q + row + 1)
        else index.push(q, q + 1, q + row, q + 1, q + row + 1, q + row)
      }
    }
  })

  const skinny = smoothGeometry(positions[0], index)
  const buff = smoothGeometry(positions[1], index)
  const count = positions[0].length / 3
  const geometry = new BufferGeometry()
  geometry.setIndex(index)
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions[0]), 3))
  geometry.setAttribute('normal', new BufferAttribute(skinny, 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setAttribute('aMuscle', new BufferAttribute(new Float32Array(muscle), 4))
  geometry.setAttribute('skinIndex', new BufferAttribute(new Float32Array(skinIndex), 4))
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(skinWeight), 4))
  const dp = new Float32Array(count * 3)
  const dn = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i += 1) {
    dp[i] = positions[1][i] - positions[0][i]
    dn[i] = buff[i] - skinny[i]
  }
  geometry.morphAttributes.position = [new BufferAttribute(dp, 3)]
  geometry.morphAttributes.normal = [new BufferAttribute(dn, 3)]
  geometry.morphTargetsRelative = true
  const flat = geometry.toNonIndexed()
  geometry.dispose()
  return flat
}

/** Smooth vertex normals for `positions` and triangles `index`, shared across the faces' seams. */
function smoothGeometry(positions, index) {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i] * 3, index[i + 1] * 3, index[i + 2] * 3]
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const k of [a, b, c]) {
      normals[k] += nx
      normals[k + 1] += ny
      normals[k + 2] += nz
    }
  }
  // Vertices at the same spot (where faces meet) share one normal: no creases. The
  // spot's key is its position to a thousandth, packed into one exact number.
  const spot = (k) =>
    ((Math.round(positions[k] * 1000) + 20000) * 40001 + Math.round(positions[k + 1] * 1000) + 20000) * 40001 +
    Math.round(positions[k + 2] * 1000) +
    20000
  const shared = new Map()
  for (let k = 0; k < positions.length; k += 3) {
    const key = spot(k)
    const sum = shared.get(key) ?? [0, 0, 0]
    sum[0] += normals[k]
    sum[1] += normals[k + 1]
    sum[2] += normals[k + 2]
    shared.set(key, sum)
  }
  for (let k = 0; k < positions.length; k += 3) {
    const [x, y, z] = shared.get(spot(k))
    const l = Math.hypot(x, y, z) || 1
    normals[k] = x / l
    normals[k + 1] = y / l
    normals[k + 2] = z / l
  }
  return normals
}

// --- Statues ----------------------------------------------------------------------------

/** The base avatar's part boxes in its bind pose (player.glb): [width, height, depth, x, y]. */
const AVATAR_BOXES = {
  torso: [2.8, 2.4, 1.6, 0, 3.6],
  arm_L: [1.2, 2.4, 1.6, 2, 3.6],
  arm_R: [1.2, 2.4, 1.6, -2, 3.6],
  leg_L: [1.4, 2.4, 1.6, 0.7, 1.2],
  leg_R: [1.4, 2.4, 1.6, -0.7, 1.2],
}
/** The double-biceps flex: upper arms turned out just above level, forearms on up past upright. */
const FLEX_UPPER = 1.66
const FLEX_FORE = 1.75
const FLEX_TUCK = 0.5

/**
 * A full bodybuilder in the double-biceps flex - upper arms out to the sides, forearms
 * up, fists by the head - for statues: each body part (keyed as PARTS) as a plain
 * geometry, position and normal, in avatar units with its feet at y 0, facing +z. The
 * same shapes as the players' bodies, posed as the skeleton would pose them: each arm
 * vertex turned by its upper arm and forearm, blended by its skin weights. `build` is how
 * built (the morph, 0 skinny to 1 a bodybuilder), and `detail` how finely each part is
 * divided ({ along, around } by part shape - torso, arm, leg - or null: as the players').
 */
export function flexingBodybuilder(build = 1, detail = null) {
  const parts = {}
  for (const [slot, [w, h, d, x, y]] of Object.entries(AVATAR_BOXES)) {
    const box = new BoxGeometry(w, h, d).translate(x, y, 0)
    // Top bones (Spine1, ArmL1 ...) are skin index 0, the lower ones 1.
    const fine = detail?.[PARTS[slot].shape] ?? null
    parts[slot] = posed(PARTS[slot], buildMusclePart(slot, box, (name) => (name.endsWith('1') ? 0 : 1), fine), x, y + h / 2, build)
    box.dispose()
  }
  return parts
}

/** `source`'s shape `build` of the way to a bodybuilder's, its arms flexed about the shoulder at (x, top). */
function posed(part, source, x, top, build) {
  const pos = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  const weight = source.getAttribute('skinWeight')
  const [dp] = source.morphAttributes.position
  const [dn] = source.morphAttributes.normal
  const arm = part.shape === 'arm'
  // Raised in the flex, an arm turns about the top of its shoulder: tucked in a little
  // further than hanging down, so its deltoid still meets the chest.
  const out = part.side * (arm ? shoulderOffset(build, build) - FLEX_TUCK * build : part.shape === 'leg' ? BODY_OFFSETS.hip[1] * build : 0)
  // Shoulder and elbow, and the elbow where the upper arm's turn takes it.
  const sx = x + out
  const ex = sx
  const ey = top - (AVATAR_BOXES.arm_L[1] / 2)
  const a1 = part.side * FLEX_UPPER
  const a2 = part.side * (FLEX_UPPER + FLEX_FORE)
  const [c1, s1, c2, s2] = [Math.cos(a1), Math.sin(a1), Math.cos(a2), Math.sin(a2)]
  const elbowX = sx + (ex - sx) * c1 - (ey - top) * s1
  const elbowY = top + (ex - sx) * s1 + (ey - top) * c1
  const positions = new Float32Array(pos.count * 3)
  const normals = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i) + dp.getX(i) * build + out
    const py = pos.getY(i) + dp.getY(i) * build
    const pz = pos.getZ(i) + dp.getZ(i) * build
    let nx = normal.getX(i) + dn.getX(i) * build
    let ny = normal.getY(i) + dn.getY(i) * build
    const nz = normal.getZ(i) + dn.getZ(i) * build
    let x2 = px
    let y2 = py
    if (arm) {
      const w = weight.getX(i)
      const ux = sx + (px - sx) * c1 - (py - top) * s1
      const uy = top + (px - sx) * s1 + (py - top) * c1
      const fx = elbowX + (px - ex) * c2 - (py - ey) * s2
      const fy = elbowY + (px - ex) * s2 + (py - ey) * c2
      x2 = w * ux + (1 - w) * fx
      y2 = w * uy + (1 - w) * fy
      const mx = w * (nx * c1 - ny * s1) + (1 - w) * (nx * c2 - ny * s2)
      const my = w * (nx * s1 + ny * c1) + (1 - w) * (nx * s2 + ny * c2)
      nx = mx
      ny = my
    }
    const l = Math.hypot(nx, ny, nz) || 1
    positions.set([x2, y2, pz], i * 3)
    normals.set([nx / l, ny / l, nz / l], i * 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  return geometry
}
