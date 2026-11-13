import { EGG_STANDS, FREE_REWARD, SPHINX_STAND } from '@shared/world'

import { STYLE } from '../materials'

/**
 * Egg stands: a blue-and-white pedestal ringed in light, plus the big Demon Egg's dark
 * plinth (with its horns and wings) and the Sphinx showcase. Blocks and merged props,
 * riding along in the world's existing draw calls; the eggs themselves float above in
 * EggDisplays.
 */

/** Each stand's light ring, in its egg's colour. */
const RING = { basic: '#7fe2ff', meadow: '#5cff6a', sunset: '#ffb347', unicorn: '#ff9cf4' }

/** Height of an egg's centre above the ground. */
export const eggHeight = (stand) => (stand.big ? 3.4 : 2.6)

export function buildEggStands(blocks, props) {
  for (const stand of EGG_STANDS) {
    if (stand.big) {
      // Demon Egg: dark stepped plinth with a glowing rim, horns and bat wings.
      blocks.addOn(stand.x, 0, stand.z, 4.2, 0.7, 4.2, '#24141f')
      blocks.addOn(stand.x, 0.7, stand.z, 3.6, 0.35, 3.6, '#ff3b1e', STYLE.LAVA)
      blocks.addOn(stand.x, 1.05, stand.z, 3.2, 0.3, 3.2, '#3a1a2a')
      const y = eggHeight(stand)
      for (const side of [-1, 1]) {
        props.box(stand.x + side * 0.7, y + 1.95, stand.z, 0.35, 1.1, 0.35, '#1d1d24', STYLE.SMOOTH, [0, 0, side * -0.45])
        props.box(stand.x + side * 1.85, y + 0.5, stand.z - 0.3, 1.6, 0.9, 0.12, '#a8162a', STYLE.STUDS, [0, side * 0.3, side * 0.45])
        props.box(stand.x + side * 2.45, y + 1.05, stand.z - 0.45, 1.0, 0.6, 0.12, '#7a0f1f', STYLE.STUDS, [0, side * 0.3, side * 0.8])
      }
      continue
    }
    // An octagonal pedestal (two squares turned an eighth apart): a blue base, a band of
    // light in the egg's colour, a white plinth, and a glowing cushion the egg floats over.
    const ring = RING[stand.eggId] || RING.basic
    for (const turn of [0, Math.PI / 4]) {
      blocks.addOn(stand.x, 0, stand.z, 3.4, 0.42, 3.4, '#2f7fe6', STYLE.STUDS, turn)
      blocks.addOn(stand.x, 0.42, stand.z, 3.1, 0.12, 3.1, ring, STYLE.GLOW, turn)
      blocks.addOn(stand.x, 0.54, stand.z, 2.8, 0.34, 2.8, '#f4f7fb', STYLE.SMOOTH, turn)
    }
    blocks.addOn(stand.x, 0.88, stand.z, 1.3, 0.1, 1.3, ring, STYLE.GLOW, Math.PI / 4)
    // Gold posts with glowing tips at four of its corners.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        blocks.addOn(stand.x + sx * 1.2, 0.42, stand.z + sz * 1.2, 0.22, 0.9, 0.22, '#ffd21f', STYLE.SMOOTH)
        blocks.add(stand.x + sx * 1.2, 1.42, stand.z + sz * 1.2, 0.3, 0.3, 0.3, ring, STYLE.GLOW, 0.785, 0.6, 0)
      }
    }
  }

  // Free Reward stand by spawn; its crab is drawn by RewardCrab.
  blocks.addOn(FREE_REWARD.x, 0, FREE_REWARD.z, 3, 0.6, 3, '#6a1420')
  blocks.addOn(FREE_REWARD.x, 0.6, FREE_REWARD.z, 2.6, 0.3, 2.6, '#ff3b3b', STYLE.GLOW)
  blocks.addOn(FREE_REWARD.x, 0.9, FREE_REWARD.z, 2.2, 0.2, 2.2, '#f4f7fb')

  // Sphinx showcase plinth: gold-trimmed and taller, the pet itself is added by Showcase.
  const { x, z } = SPHINX_STAND
  blocks.addOn(x, 0, z, 5.6, 0.8, 5.6, '#2f6fe0')
  blocks.addOn(x, 0.8, z, 5, 0.5, 5, '#ffcf3a', STYLE.GLOW)
  blocks.addOn(x, 1.3, z, 4.4, 0.4, 4.4, '#f4f7fb')
}
