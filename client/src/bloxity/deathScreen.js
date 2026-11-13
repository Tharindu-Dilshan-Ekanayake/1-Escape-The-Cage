import { getGame } from '../store/game'
import { getSDK, safeCall } from './sdk'

/**
 * Boxity's death screen. When the boulder crushes you, Boxity may show ads around the
 * game while you're down, and the game's own Respawn button (DeathCard) waits out its
 * countdown - at least 4 s - so they're seen. Never a respawn on a timer: only the
 * button, once Boxity says so. Outside Boxity, or with no ads to show, the countdown is
 * 0 at once and Respawn works straight away, so this one path works everywhere.
 */

let death = null
let offCountdown = null
let onRespawn = null

/**
 * You've been crushed: `info` (`{ stage, need }`) for the card, and `respawn` to run
 * once Respawn is pressed (and allowed).
 */
export function openDeathScreen(info, respawn) {
  closeHandles()
  const sdk = getSDK()
  death = safeCall(() => sdk?.deathScreen?.show?.()) ?? null
  onRespawn = respawn
  getGame().setDeath({ ...info, seconds: death ? 4 : 0 })
  if (death?.onCountdown) {
    offCountdown = safeCall(() =>
      death.onCountdown((seconds) => {
        const current = getGame().death
        if (current) getGame().setDeath({ ...current, seconds: Math.max(0, Math.ceil(Number(seconds) || 0)) })
      }),
    )
  }
}

/** Respawn pressed: goes ahead only if Boxity's countdown is over. Returns whether it did. */
export function pressRespawn() {
  if (!getGame().death) return false
  if (death && !safeCall(() => death.respawn())) return false
  const respawn = onRespawn
  closeHandles()
  getGame().setDeath(null)
  respawn?.()
  return true
}

/**
 * Away from the death screen some other way (Boxity's "Reset Character", or the climb
 * ending): Boxity is told to take it down, rather than a respawn being claimed.
 */
export function closeDeathScreen() {
  if (death) safeCall(() => getSDK()?.deathScreen?.hide?.())
  closeHandles()
  if (getGame().death) getGame().setDeath(null)
}

function closeHandles() {
  if (typeof offCountdown === 'function') safeCall(offCountdown)
  offCountdown = null
  death = null
  onRespawn = null
}
