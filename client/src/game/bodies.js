import { Color } from 'three'

import { BODIES } from '@shared/balance'

import { STYLE } from './materials'

/**
 * How each bodybuilder body looks (their stats are BODIES in shared/balance.js).
 *
 * A body changes only your avatar's shape - nothing else: your Bloxity avatar keeps its
 * own colours, clothes, face and everything it wears, exactly as the SDK gives them.
 * Every body up the shop is bigger than the one before it - taller (`height`, against a
 * plain avatar), broader (`width`) and more muscular (`bulk`, 0-1: the body's morph, see
 * muscleBody and avatarRig - chest, abs, back, arms and legs together) - from the skinny
 * Noodle to the last ones, full bodybuilders that keep on growing up to the TITAN, so a
 * dearer body is never the smaller one. `type` names its size in the shop. Training adds
 * muscle on top (bodyBulkFor).
 *
 * `color`, `glow` and toy `style` are the body's colours in the shop only - its pad, the
 * halo over its stand, its card - and the dumbbell you train with; never on the avatar.
 */
/** Each body's size, by its place in the shop. */
const SIZES = [
  'SKINNY', 'SLIM', 'FIT', 'TONED', 'ATHLETIC', 'STRONG', 'MUSCULAR', 'PUMPED', 'RIPPED', 'BULKY', 'SHREDDED', 'POWERFUL',
  'HUGE', 'MASSIVE', 'BEAST', 'MONSTER', 'GIANT', 'HULK', 'PRO BODYBUILDER', 'MR. UNIVERSE', 'COLOSSUS', 'LEGEND', 'GODLIKE', 'TITAN',
]
/** Each body's colours in the shop: [colour, glow, toy style]. */
const STUFF = {
  noodle: ['#f0c9a2', 0, STYLE.SMOOTH],
  toned: ['#eebf93', 0, STYLE.SMOOTH],
  pumped: ['#e9b484', 0, STYLE.SMOOTH],
  ripped: ['#d99a63', 0, STYLE.SMOOTH],
  bronze: ['#cd7f32', 0.05, STYLE.SMOOTH],
  iron: ['#8d949e', 0, STYLE.SMOOTH],
  steel: ['#d4dce6', 0.05, STYLE.SMOOTH],
  ruby: ['#e0283a', 0.18, STYLE.SMOOTH],
  emerald: ['#1fc45c', 0.18, STYLE.SMOOTH],
  sapphire: ['#2a5cff', 0.2, STYLE.SMOOTH],
  golden: ['#ffc61a', 0.3, STYLE.GLOW],
  frost: ['#9fe8ff', 0.4, STYLE.GLOW],
  lava: ['#ff5a1c', 0.5, STYLE.LAVA],
  thunder: ['#ffe14a', 0.55, STYLE.GLOW],
  toxic: ['#6fff2a', 0.5, STYLE.GLOW],
  neon: ['#ff3fd0', 0.65, STYLE.GLOW],
  crystal: ['#c4f6ff', 0.45, STYLE.GLOW],
  shadow: ['#4a3470', 0.25, STYLE.SMOOTH],
  marble: ['#f1ece4', 0.12, STYLE.SMOOTH],
  void: ['#24124a', 0.3, STYLE.GALAXY],
  galaxy: ['#4a2fc0', 0.4, STYLE.GALAXY],
  rainbow: ['#ffffff', 0.45, STYLE.RAINBOW],
  celestial: ['#fff3b8', 0.75, STYLE.GLOW],
  titan: ['#ff2a12', 0.65, STYLE.LAVA],
}
/**
 * Body `i`'s size (0 the first), in steps big enough to see from one body to the next:
 * the Noodle as thin as a body gets, then each one the same share taller and broader
 * than the last (5% broader, 3% taller) and, up to the Golden Body, a big step more
 * muscular - a full bodybuilder there - and from then on bigger and bigger to the
 * Titan, three times the Noodle's breadth and twice its height.
 */
function growth(i) {
  const along = i / (BODIES.length - 1)
  const muscle = Math.min(1, i / 10)
  const step = (first, last) => Math.round(first * (last / first) ** along * 1000) / 1000
  return { height: step(0.85, 1.8), width: step(0.6, 1.9), bulk: Math.round((1 - (1 - muscle) ** 1.3) * 1000) / 1000 }
}
export const BODY_LOOKS = Object.fromEntries(
  BODIES.map((body, i) => {
    const [color, glow, style] = STUFF[body.id]
    return [body.id, { type: SIZES[i], ...growth(i), color, glow, style }]
  }),
)

export const bodyLook = (id) => BODY_LOOKS[id] ?? BODY_LOOKS.noodle

/**
 * How built body `id` looks (the morph, 0-1) with `strengthBulk` (playerPose.bulkFor, 0-1)
 * from training: training builds you some way (45% of the way, at its most), and the body
 * you wear takes you a share of the rest - so every new body always looks bigger.
 */
export const bodyBulkFor = (id, strengthBulk = 0) => 1 - (1 - 0.45 * Math.min(1, Math.max(0, strengthBulk))) * (1 - bodyLook(id).bulk)

/** How tall and how broad body `id` is (1 is a plain avatar), whatever your Strength. */
export const bodyShape = (id) => bodyLook(id)

/** Eases `motion.height` and `motion.width` towards body `id`'s: a new body grows into shape. */
export function growShape(motion, id, delta) {
  const target = bodyLook(id)
  const k = 1 - Math.exp(-3 * delta)
  motion.height = motion.height > 0 ? motion.height + (target.height - motion.height) * k : target.height
  motion.width = motion.width > 0 ? motion.width + (target.width - motion.width) * k : target.width
}

/** Each body's shop colour, parsed once. */
const COLORS = Object.fromEntries(Object.entries(BODY_LOOKS).map(([id, look]) => [id, new Color(look.color)]))
export const bodyColor = (id) => COLORS[id] ?? COLORS.noodle

/** The body's position in the shop, 0 for the first. */
export const bodyTier = (id) => Math.max(0, BODIES.findIndex((b) => b.id === id))
