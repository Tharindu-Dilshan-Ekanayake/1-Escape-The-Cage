import { WORLDS } from '@shared/balance'
import { TRACKS } from '@shared/logic'

/**
 * The track of the world you're in. You climb one world at a time, so everything up the
 * mountain reads its stages and rules from these live bindings, and setWorld swaps them
 * all when you step through a portal (the scene then rebuilds the mountain: see
 * GameScene). The authority keeps a track per player instead: shared/logic TRACKS.
 */
export let WORLD = 0
export let TRACK = TRACKS[0]
export let STAGES = TRACK.stages
export let TRACK_LENGTH = TRACK.length
export let WIN_PADS = TRACK.winPads
/** Every Wins orb up the track, bottom to top, and those up each stage's slope. */
export let WINS_ORBS = TRACK.orbs
export let ORBS_ON = TRACK.orbsOn
export let SLOPES_BELOW = TRACK.slopesBelow
export let stageStart = TRACK.stageStart
export let stageTop = TRACK.stageTop
export let safeStart = TRACK.safeStart
export let stageAt = TRACK.stageAt
export let isSlope = TRACK.isSlope
export let stageCost = TRACK.stageCost

/** The most stages any world has: for pools sized once, whatever world you're in. */
export const MAX_STAGES = Math.max(...WORLDS.map((world) => world.stages.length))

/** Climbs world `world`'s track from now on. Returns whether that's a change. */
export function setWorld(world) {
  const track = TRACKS[world] ?? TRACKS[0]
  if (track === TRACK) return false
  WORLD = track.index
  TRACK = track
  STAGES = track.stages
  TRACK_LENGTH = track.length
  WIN_PADS = track.winPads
  WINS_ORBS = track.orbs
  ORBS_ON = track.orbsOn
  SLOPES_BELOW = track.slopesBelow
  stageStart = track.stageStart
  stageTop = track.stageTop
  safeStart = track.safeStart
  stageAt = track.stageAt
  isSlope = track.isSlope
  stageCost = track.stageCost
  return true
}
