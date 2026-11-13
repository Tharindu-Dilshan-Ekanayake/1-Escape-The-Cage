import { cagesIn } from '@shared/logic'

/**
 * The cages of the world you're in. You play one world at a time, so everything about
 * the gauntlet reads its cages from these live bindings, and setWorld swaps them when you
 * step through a portal (the scene then rebuilds the gauntlet: see GameScene). The
 * authority keeps its own per player: PlayerSession.run.
 */
export let WORLD = 0
export let CAGES = cagesIn(0)

/** Plays world `world`'s cages from now on. Returns whether that's a change. */
export function setWorld(world) {
  const cages = cagesIn(world)
  if (cages === CAGES) return false
  WORLD = world
  CAGES = cages
  return true
}
