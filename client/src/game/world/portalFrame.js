import { PORTALS } from '@shared/world'

import { STYLE } from '../materials'

/** Height of a portal ring's centre (every portal is the same size). */
export const PORTAL_CENTER_Y = PORTALS[0].radius + 0.6

/**
 * How each portal looks: its ring's alternating blocks (a third colour, if given, glows
 * on every fourth block), the slab under it, and its swirl's colours (linear RGB).
 */
export const PORTAL_THEMES = {
  shadow: {
    ring: ['#2e2738', '#45394f', '#b066ff'],
    base: '#231d2b',
    swirl: { deep: [0.25, 0.05, 0.55], light: [0.8, 0.5, 1.0], core: [0.7, 0.45, 0.9] },
  },
}

/** Each portal's frame: a ring of blocks standing upright, facing the plaza. */
export function buildPortalFrame(blocks) {
  const segments = 20
  for (const portal of PORTALS) {
    const { ring, base } = PORTAL_THEMES[portal.id]
    const r = portal.radius
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2
      const x = portal.x + Math.cos(a) * r
      const y = PORTAL_CENTER_Y + Math.sin(a) * r
      const lit = ring[2] && i % 4 === 1
      blocks.add(x, y, portal.z, 1.2, 1.2, 1.4, lit ? ring[2] : ring[i % 2], lit ? STYLE.GLOW : STYLE.STUDS, 0, 0, a)
    }
    blocks.addOn(portal.x, 0, portal.z, r * 2 + 1.5, 0.5, 2.4, base)
  }
}
