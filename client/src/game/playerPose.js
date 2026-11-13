/**
 * The player's body language, shared by the Bloxity avatar and the blocky stand-in so
 * both move the same way.
 *
 * `computePose` turns the motion state into joint angles; each avatar applies them to
 * its own limbs. Angles are radians in character space (the character faces +Z, its
 * left side is +X), about each joint's pivot:
 *   swing - about X: negative swings a limb forward (arm up in front, knee up)
 *   sway  - about Z: positive moves a limb towards +X
 *   twist - about Y: positive turns the right shoulder forward
 * `lift` raises (or, to keep bent legs on the ground, lowers) the body, in metres.
 */

import { LEVEL_FIRST, LEVEL_GROWTH } from '@shared/balance'

export const POSED_BONES = [
  'Spine1',
  'Neck1',
  'ArmL1',
  'ArmL2',
  'ArmR1',
  'ArmR2',
  'LegL1',
  'LegL2',
  'LegR1',
  'LegR2',
]

/** The level at which a body is fully built: a bodybuilder. */
const FULL_BUILD_LEVEL = 25

/**
 * How built someone is for their Muscle (their power), 0 (as skinny as can be: level
 * 1) to 1 (a bodybuilder, at FULL_BUILD_LEVEL): an even step for every level their
 * Muscle is worth, so a level 5 and a level 17 look nothing alike - and fractions of a
 * level too, so it grows a little with every click. The level isn't capped, so Muscle
 * past the rebirth cap keeps building you; a rebirth, which takes your Muscle back to
 * 0, makes you skinny again.
 */
export function bulkFor(muscle = 0) {
  // muscleForLevel turned round: Muscle m is worth level 1 + log(1 + m(G-1)/F) / log G.
  const level = 1 + Math.log(1 + (Math.max(0, muscle) * (LEVEL_GROWTH - 1)) / LEVEL_FIRST) / Math.log(LEVEL_GROWTH)
  return Math.min(1, (level - 1) / (FULL_BUILD_LEVEL - 1))
}

/** How fast a body grows into (or out of) its build, per second: it eases, never jumps. */
const GROW_RATE = 3

/** Eases `motion.bulk` towards `target`; a body with no build yet (-1) takes it at once. */
export function growBody(motion, target, delta) {
  if (!(motion.bulk >= 0)) motion.bulk = target
  else motion.bulk += (target - motion.bulk) * (1 - Math.exp(-GROW_RATE * delta))
}

/**
 * How a blocky stand-in's parts are built against its own, skinny (bulk 0) and
 * bodybuilder (1): the chest's width and torso's depth, the arms' and the legs' width
 * and depth. (The real avatar's body is muscleBody's.)
 */
const SKINNY = { chestX: 0.6, torsoZ: 0.7, armX: 0.5, armZ: 0.6, legX: 0.66, legZ: 0.72 }
const BUFF = { chestX: 1.85, torsoZ: 1.35, armX: 1.95, armZ: 1.6, legX: 1.2, legZ: 1.2 }
const BUILD_KEYS = Object.keys(SKINNY)
const build = { ...SKINNY }

/** The build (see SKINNY) of a body of `bulk`: one shared result, to use at once. */
export function bodyBuild(bulk = 0.5) {
  const t = Math.min(1, Math.max(0, bulk))
  for (const key of BUILD_KEYS) build[key] = SKINNY[key] + (BUFF[key] - SKINNY[key]) * t
  return build
}

/**
 * A classic blocky figure's part of `kind` ('torso', 'arm' or 'leg'; anything else is
 * left be), on `side` (+1 left, -1 right), built as `b`: writes its width and depth
 * multipliers and its middle's x, in studs, into `out` as (x, y, z). Arms and legs stay
 * at the body's sides however broad it gets.
 */
export function blockyPart(kind, side, b, out) {
  if (kind === 'torso') return out.set(b.chestX, b.torsoZ, 0)
  if (kind === 'arm') return out.set(b.armX, b.armZ, side * (b.chestX + 0.5 * b.armX))
  if (kind === 'leg') return out.set(b.legX, b.legZ, side * 0.5 * b.legX)
  return out.set(1, 1, 0)
}

/** Written by `computePose` every frame; one shared result, never reallocated. */
export const pose = {
  lift: 0,
  bones: Object.fromEntries(POSED_BONES.map((name) => [name, { swing: 0, sway: 0, twist: 0 }])),
}

/** Sway sign that moves a limb away from the body, per side. */
const OUT_L = 1
const OUT_R = -1

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const smooth = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** Adds to a joint, scaled by weight `w`. */
function add(name, swing, sway, twist, w) {
  const b = pose.bones[name]
  b.swing += swing * w
  b.sway += sway * w
  b.twist += twist * w
}

/** Relaxed stance: arms hanging a little out from the sides, knees soft, breathing. */
function stance(w, time) {
  const breath = Math.sin(time * 1.8)
  add('LegL1', -0.04, 0.06 * OUT_L, 0, w)
  add('LegL2', 0.08, 0, 0, w)
  add('LegR1', 0.04, 0.06 * OUT_R, 0, w)
  add('LegR2', 0.08, 0, 0, w)
  add('Spine1', -0.03 + breath * 0.015, 0, 0, w)
  add('ArmL1', -0.08 + breath * 0.03, 0.14 * OUT_L, 0, w)
  add('ArmL2', -0.25, 0, 0, w)
  add('ArmR1', -0.08 + breath * 0.03, 0.14 * OUT_R, 0, w)
  add('ArmR2', -0.25, 0, 0, w)
  pose.lift += (-0.01 + breath * 0.006) * w
}

/**
 * Standing about: a little dance to yourself - a bounce in the knees on the beat, a
 * sway, the arms swinging along.
 */
function grooving(time, w) {
  const beat = time * 4.2
  const bob = Math.sin(beat)
  const sway = Math.sin(beat * 0.5)
  add('LegL1', -0.08 * Math.max(0, bob), 0, 0, w)
  add('LegR1', -0.08 * Math.max(0, -bob), 0, 0, w)
  add('LegL2', 0.18 * Math.max(0, bob), 0, 0, w)
  add('LegR2', 0.18 * Math.max(0, -bob), 0, 0, w)
  add('Spine1', 0, sway * 0.07, sway * 0.12, w)
  add('Neck1', 0, -sway * 0.08, 0, w)
  add('ArmL1', -0.22 - 0.22 * Math.max(0, bob), 0, 0, w)
  add('ArmR1', -0.22 - 0.22 * Math.max(0, -bob), 0, 0, w)
  add('ArmL2', -0.45, 0, 0, w)
  add('ArmR2', -0.45, 0, 0, w)
  pose.lift -= Math.abs(bob) * 0.03 * w
}

/**
 * Walk to sprint: arms and legs swing against each other, the body leans in and bobs
 * once per step. `phase` advances faster with speed, so the steps quicken.
 */
function stride(phase, ratio) {
  const cycle = Math.sin(phase)
  const leg = 0.85 * ratio
  const arm = 0.75 * ratio
  add('LegL1', cycle * leg, 0, 0, 1)
  add('LegR1', -cycle * leg, 0, 0, 1)
  // Knees fold on the back swing only.
  add('LegL2', Math.max(0, -cycle) * 1.1 * ratio, 0, 0, 1)
  add('LegR2', Math.max(0, cycle) * 1.1 * ratio, 0, 0, 1)
  add('ArmL1', -cycle * arm, 0.08 * OUT_L * ratio, 0, 1)
  add('ArmR1', cycle * arm, 0.08 * OUT_R * ratio, 0, 1)
  add('ArmL2', -(0.35 + Math.max(0, -cycle) * 0.5) * ratio, 0, 0, 1)
  add('ArmR2', -(0.35 + Math.max(0, cycle) * 0.5) * ratio, 0, 0, 1)
  add('Spine1', -(0.08 + 0.14 * ratio) * ratio, 0, cycle * 0.12 * ratio, 1)
  pose.lift += (Math.abs(Math.cos(phase)) * 0.05 - 0.015) * ratio
}

/**
 * In the air: one knee up and the arms out on the way up; falling, the legs straighten
 * and reach down for the ground.
 */
function airborne(vy) {
  const f = smooth(0, 1, clamp01((2 - vy) / 9))
  add('LegL1', lerp(-1.3, -0.35, f), 0.08 * OUT_L, 0, 1)
  add('LegL2', lerp(1.6, 0.25, f), 0, 0, 1)
  add('LegR1', lerp(0.25, -0.1, f), 0.08 * OUT_R, 0, 1)
  add('LegR2', lerp(0.5, 0.2, f), 0, 0, 1)
  add('ArmL1', lerp(-0.35, -0.6, f), lerp(1.15, 1.45, f) * OUT_L, 0, 1)
  add('ArmL2', -0.35, 0, 0, 1)
  add('ArmR1', lerp(-0.25, -0.5, f), lerp(1.05, 1.35, f) * OUT_R, 0, 1)
  add('ArmR2', -0.4, 0, 0, 1)
  add('Spine1', lerp(-0.15, 0.06, f), 0, 0, 1)
}

/**
 * At a cage's bars, pulling them apart: both arms out in front at chest height, hands
 * gripping the middle two bars - `spread` (0-1) of the way from close together to wide
 * apart, as far as the bars have given - the body leaning back on braced legs. `heave`
 * (0-1) is a tap's effort: the arms drive further apart and straighten, the lean deepens
 * and everything shakes with the strain.
 */
function prying(w, spread, heave, time) {
  const shake = Math.sin(time * 46) * 0.035 * heave
  const open = 0.22 + 0.5 * spread + 0.16 * heave
  add('ArmL1', -1.32 + shake, open * OUT_L, 0, w)
  add('ArmR1', -1.32 - shake, open * OUT_R, 0, w)
  add('ArmL2', -0.62 + 0.38 * heave, 0, 0, w)
  add('ArmR2', -0.62 + 0.38 * heave, 0, 0, w)
  add('Spine1', 0.1 + 0.14 * heave, 0, 0, w)
  add('Neck1', -0.08 - 0.1 * heave, 0, 0, w)
  add('LegL1', -0.42, 0.08 * OUT_L, 0, w)
  add('LegR1', 0.34 + 0.1 * heave, 0.08 * OUT_R, 0, w)
  add('LegL2', 0.5, 0, 0, w)
  add('LegR2', 0.16, 0, 0, w)
  pose.lift -= (0.08 + 0.03 * heave) * w
}

/**
 * A dumbbell curl with the right hand, `t` 0-1 through it: the forearm swings the
 * weight up to the shoulder and back down, the body bracing a little.
 */
function curling(t, w = 1) {
  const up = Math.sin(clamp01(t) * Math.PI)
  add('ArmR1', -0.25 * up, 0.05 * OUT_R, 0, w)
  add('ArmR2', -2.1 * up, 0, 0, w)
  add('Spine1', 0.06 * up, 0, 0, w)
  pose.lift -= 0.02 * up * w
}

/** How far sitting lowers the body: from standing hips down to just over a bench seat. */
const SIT_DROP = 0.26

/**
 * Sat on a bench: thighs out level in front, shins straight down to the floor, sitting
 * up, the left hand resting on its knee (the right one curls).
 */
function seated(time) {
  const breath = Math.sin(time * 1.8)
  add('LegL1', -1.5, 0.14 * OUT_L, 0, 1)
  add('LegR1', -1.5, 0.14 * OUT_R, 0, 1)
  add('LegL2', 1.5, 0, 0, 1)
  add('LegR2', 1.5, 0, 0, 1)
  add('Spine1', 0.04 + breath * 0.015, 0, 0, 1)
  add('ArmL1', -0.45, 0.12 * OUT_L, 0, 1)
  add('ArmL2', -0.7, 0, 0, 1)
  add('ArmR1', -0.1, 0.12 * OUT_R, 0, 1)
  add('ArmR2', -0.3, 0, 0, 1)
  pose.lift -= SIT_DROP
}

/** The win dance: fists punching the air in turn, hips swinging, bouncing to the beat. */
function dancing(time, w) {
  const beat = time * 7
  const a = Math.sin(beat)
  const sway = Math.sin(beat * 0.5)
  add('ArmL1', -2.5 + a * 0.55, 0.32 * OUT_L, 0, w)
  add('ArmR1', -2.5 - a * 0.55, 0.32 * OUT_R, 0, w)
  add('ArmL2', -0.35 - Math.max(0, a) * 0.9, 0, 0, w)
  add('ArmR2', -0.35 - Math.max(0, -a) * 0.9, 0, 0, w)
  add('Spine1', 0.06, sway * 0.16, sway * 0.3, w)
  add('Neck1', -0.1, -sway * 0.12, 0, w)
  add('LegL1', -0.35 * Math.max(0, a), 0.1 * OUT_L, 0, w)
  add('LegR1', -0.35 * Math.max(0, -a), 0.1 * OUT_R, 0, w)
  add('LegL2', 0.6 * Math.max(0, a), 0, 0, w)
  add('LegR2', 0.6 * Math.max(0, -a), 0, 0, w)
  pose.lift += Math.abs(a) * 0.14 * w
}

/**
 * Bodybuilding poses, held standing: the double biceps (upper arms out level, fists up by
 * the head), the front lat spread (fists on the hips, elbows wide, the back flared) and
 * the most muscular (hunched over, fists together in front, everything tensed). Each
 * trembles a little with the effort.
 */
function doubleBiceps(w, time) {
  const tense = Math.sin(time * 31) * 0.014
  add('ArmL1', -0.12, (1.5 + tense) * OUT_L, 0, w)
  add('ArmR1', -0.12, (1.5 - tense) * OUT_R, 0, w)
  add('ArmL2', 0, 1.8 * OUT_L, 0, w)
  add('ArmR2', 0, 1.8 * OUT_R, 0, w)
  add('Spine1', -0.08, 0, 0, w)
  add('Neck1', -0.06, 0, 0, w)
  add('LegL1', 0, 0.12 * OUT_L, 0, w)
  add('LegR1', 0, 0.12 * OUT_R, 0, w)
}

function latSpread(w, time) {
  const tense = Math.sin(time * 29) * 0.012
  add('ArmL1', -0.3, (0.62 + tense) * OUT_L, 0, w)
  add('ArmR1', -0.3, (0.62 - tense) * OUT_R, 0, w)
  add('ArmL2', -0.2, -2.0 * OUT_L, 0, w)
  add('ArmR2', -0.2, -2.0 * OUT_R, 0, w)
  add('Spine1', -0.12, 0, 0, w)
  add('Neck1', -0.04, 0, 0, w)
  add('LegL1', 0, 0.14 * OUT_L, 0, w)
  add('LegR1', 0, 0.14 * OUT_R, 0, w)
  pose.lift += 0.01 * w
}

function mostMuscular(w, time) {
  const tense = Math.sin(time * 33) * 0.016
  add('ArmL1', -0.78 + tense, 0.4 * OUT_L, 0, w)
  add('ArmR1', -0.78 - tense, 0.4 * OUT_R, 0, w)
  add('ArmL2', -0.25, -1.65 * OUT_L, 0, w)
  add('ArmR2', -0.25, -1.65 * OUT_R, 0, w)
  add('Spine1', 0.2, 0, 0, w)
  add('Neck1', 0.12, 0, 0, w)
  add('LegL1', -0.12, 0.16 * OUT_L, 0, w)
  add('LegR1', -0.12, 0.16 * OUT_R, 0, w)
  add('LegL2', 0.24, 0, 0, w)
  add('LegR2', 0.24, 0, 0, w)
  pose.lift -= 0.05 * w
}

const POSES = [doubleBiceps, latSpread, mostMuscular]
/** Seconds standing still before you start your posing routine; each pose's hold, and the blend between them. */
const POSE_AFTER = 3.5
const POSE_HOLD = 2.4
const POSE_EASE = 0.35
/** The routine, then this long relaxing (grooving) before it starts again. */
const POSE_CYCLE = POSES.length * POSE_HOLD + 7
/** How long you hold the double biceps on putting on a new body. */
const FLEX_TIME = 2.6

/** 0 to 1 over `ease` at the start of `hold`, back to 0 over its end. */
const envelope = (t, hold, ease = POSE_EASE) => smooth(0, ease, t) * (1 - smooth(hold - ease, hold, t))

/**
 * Keeps a motion's posing up to date, per frame, before it's posed: `body` is the body
 * worn (a new one - not the first - is shown off with a flex), and standing still a while
 * starts the posing routine; moving, jumping, curling, dancing or a cage stops it. Writes
 * `idle` (seconds still), and for computePose `posing` (0-1, how far into a pose),
 * `poseA`/`poseB` (which, as it blends from one to the next) and `poseMix`.
 */
export function trackPosing(motion, body, delta) {
  if (motion.body && body !== motion.body) motion.flexAt = motion.time
  motion.body = body
  const still =
    motion.grounded && !motion.sitting && motion.speed < 0.4 && !(motion.pull > 0.05) && !(motion.dance > 0) && !(motion.curl > 0) && !motion.emoteClip
  motion.idle = still ? (motion.idle ?? 0) + delta : 0
  if (!still) motion.flexAt = -Infinity
  const since = motion.time - (motion.flexAt ?? -Infinity)
  motion.posing = 0
  motion.poseA = 0
  motion.poseB = 0
  motion.poseMix = 0
  if (since < FLEX_TIME) {
    motion.posing = envelope(since, FLEX_TIME)
  } else if (motion.idle > POSE_AFTER) {
    const t = (motion.idle - POSE_AFTER) % POSE_CYCLE
    const span = POSES.length * POSE_HOLD
    if (t < span) {
      const i = Math.min(POSES.length - 1, Math.floor(t / POSE_HOLD))
      const f = t - i * POSE_HOLD
      motion.posing = envelope(t, span)
      motion.poseA = i
      motion.poseB = Math.min(POSES.length - 1, i + 1)
      motion.poseMix = i + 1 < POSES.length ? smooth(POSE_HOLD - POSE_EASE, POSE_HOLD, f) : 0
    }
  }
}

/** Seconds per automatic curl in a Train Zone (TRAIN_INTERVAL in balance.js). */
const TRAIN_PERIOD = 0.8

/**
 * @param {{ time?: number, speed?: number, maxSpeed?: number, grounded?: boolean,
 *   vy?: number, stride?: number, pull?: number, spread?: number, heave?: number,
 *   curl?: number, training?: boolean, sitting?: boolean, dance?: number, bulk?: number,
 *   posing?: number, poseA?: number, poseB?: number, poseMix?: number }} motion
 *   `pull` (0-1) grips a cage's bars to pull them apart, `spread` (0-1) how far apart
 *   they've gone, `heave` (0-1) a tap's effort on them. Otherwise `curl` (0-1) is a
 *   lift in progress (0 = none), `sitting` sits you on a bench and `training` curls on a
 *   loop, on a Train Zone's bench, and `dance` (0-1) is the win dance. `bulk` (0-1, how
 *   built) carries the arms out wide of the lats, the way bodybuilders stand and walk;
 *   `posing` and the rest (see trackPosing) strike a bodybuilding pose.
 */
export function computePose(motion) {
  const {
    time = 0,
    speed = 0,
    maxSpeed = 6,
    grounded = true,
    vy = 0,
    stride: phase = time * 5,
    pull = 0,
    spread = 0,
    heave = 0,
    curl = 0,
    training = false,
    sitting = false,
    dance = 0,
    bulk = 0,
    posing = 0,
    poseA = 0,
    poseB = 0,
    poseMix = 0,
  } = motion
  for (const name of POSED_BONES) {
    const b = pose.bones[name]
    b.swing = 0
    b.sway = 0
    b.twist = 0
  }
  pose.lift = 0

  if (sitting) {
    seated(time)
  } else if (grounded) {
    const ratio = clamp01(speed / Math.max(maxSpeed, 0.001))
    const still = (1 - smooth(0.05, 0.4, ratio)) * (1 - dance) * (1 - pull)
    const show = still * posing
    const relaxed = still - show
    stance(relaxed, time)
    if (relaxed > 0.01) grooving(time, relaxed)
    if (show > 0.001) {
      POSES[poseA](show * (1 - poseMix), time)
      if (poseMix > 0) POSES[poseB](show * poseMix, time)
    }
    // Arms carried out wide of the lats the more built you are, standing or walking.
    const flare = 0.32 * clamp01(bulk) * (1 - dance) * (1 - pull) * (1 - show)
    add('ArmL1', 0, flare * OUT_L, 0, 1)
    add('ArmR1', 0, flare * OUT_R, 0, 1)
    add('LegL1', 0, 0.2 * flare * OUT_L, 0, 1)
    add('LegR1', 0, 0.2 * flare * OUT_R, 0, 1)
    if (ratio > 0.02) stride(phase, ratio)
    if (dance > 0) dancing(time, dance)
    if (pull > 0) prying(pull, spread, heave, time)
  } else {
    airborne(vy)
  }
  if (pull > 0.5) {
    // Both hands on the bars: no curl.
  } else if (training) curling((time / TRAIN_PERIOD) % 1, 1)
  else if (curl > 0) curling(curl, 1)
  return pose
}
