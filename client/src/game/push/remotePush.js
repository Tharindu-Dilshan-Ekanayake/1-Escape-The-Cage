import { stageAt } from './course'

import { boulderRadius, feetPoint } from './path'

let frameKey = -1

/**
 * Eases everyone up the mountain towards where they last reported: turning the boulder
 * of those pushing one, and facing those walking a SAFEZONE the way they're going.
 * Idempotent per frame (keyed on the renderer's clock), so the figures, the avatars and
 * the boulders all see exactly the same state however many of them ask. Each remote's
 * `shownAt` is where to draw their feet.
 */
export function stepRemotePushers(players, clockTime, delta) {
  if (frameKey === clockTime) return
  frameKey = clockTime
  const k = 1 - Math.exp(-6 * delta)
  for (const r of players.values()) {
    if (!r.pushing) continue
    const before = r.shownMeter
    const beforeX = r.shownX
    r.shownMeter += (r.pushMeter - r.shownMeter) * k
    r.shownX += (r.pushX - r.shownX) * k
    const along = r.shownMeter - before
    const across = r.shownX - beforeX
    r.pushStage = stageAt(r.shownMeter)
    r.pushSpeed = along / Math.max(delta, 1e-3)
    r.climbSpeed = Math.hypot(along, across) / Math.max(delta, 1e-3)
    // Up the track is north (-z).
    if (Math.abs(along) + Math.abs(across) > 1e-3) r.climbYaw = Math.atan2(across, -along)
    if (r.pushPhase === 'push') r.roll += along / boulderRadius(r.pushStage)
    feetPoint(r.shownMeter, r.shownX, r.shownAt)
  }
}
