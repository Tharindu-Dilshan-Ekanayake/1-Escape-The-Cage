import { isZoneUnlocked } from '@shared/logic'
import {
  AURA_STAND,
  eggStandNear,
  FREE_REWARD,
  padAt,
  portalAt,
  PORTALS,
  POTION_STAND,
  roomAt,
  SPHINX_STAND,
  ZONE_COUNT,
  zoneAt,
  zoneDeckRect,
} from '@shared/world'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame, useGame } from '../store/game'
import { cageHere, checkPad, resetRun } from './cages/cageControl'
import { CAGES, setWorld } from './cages/course'
import { portalLabelSpec, zoneLabelSpec } from './labels/lobbyLabels'
import { updateWorldLabel } from './labels/registry'
import { runtime } from './runtime'

const TICK_MS = 100

const ZONE_KEYS = ['trainZone', 'trainZoneNear', 'sphinx', 'pad', 'egg', 'portal', 'freeReward', 'auras', 'potions', 'cage', 'room']
const sameZone = (a, b) => ZONE_KEYS.every((key) => a[key] === b[key])

/** Locked Train Zones become solid walls for the controller; their signs say what's open. */
function syncZones(profile) {
  const walls = []
  for (let i = 0; i < ZONE_COUNT; i += 1) {
    const unlocked = isZoneUnlocked(profile, i)
    if (!unlocked) walls.push(zoneDeckRect(i))
    updateWorldLabel(`zone-${i}`, zoneLabelSpec(i, unlocked))
  }
  runtime.dynamicColliders = walls
}

/** Plays the cages of the world you're in - a new run - and puts that world's signs up in the lobby. */
function syncWorld(world) {
  setWorld(world)
  resetRun()
  for (const portal of PORTALS) updateWorldLabel(`portal-${portal.id}`, portalLabelSpec(portal.id, world))
}

/** What syncZones depends on, so it only runs when that changes. */
const zoneKey = (profile) => `${profile.rebirths}:${profile.passes.zoneVeryOp ? 1 : 0}${profile.passes.zoneBest ? 1 : 0}`

const near = (stand, p) => Math.hypot(p.x - stand.x, p.z - stand.z) < stand.radius

/**
 * The 10 Hz bridge between the frame-rate world and the UI: works out which zone the
 * player stands in (a Train Zone, a cage's bars, a WIN pad...), tells the authority about
 * Train Zone changes and WIN pads, and keeps locked-zone walls in step with the profile. This - not the render loop - is what writes zone
 * state into the store, and only when something actually changed.
 *
 * @returns {() => void} stop
 */
export function startGameTicker() {
  let lastZone = -1
  let lastKey = zoneKey(getGame().profile)

  syncZones(getGame().profile)
  syncWorld(getGame().profile.world)
  const unsubscribe = useGame.subscribe((state, prev) => {
    if (state.profile === prev.profile) return
    // Before React renders the new world: its gauntlet is built from this (GameScene).
    if (state.profile.world !== prev.profile.world) syncWorld(state.profile.world)
    const key = zoneKey(state.profile)
    if (key === lastKey) return
    lastKey = key
    syncZones(state.profile)
  })

  const tick = () => {
    const game = getGame()
    const p = runtime.player.position
    const egg = eggStandNear(p.x, p.z)
    const zone = {
      // Training is sitting on a Train Zone's bench.
      trainZone: runtime.player.bench,
      // Standing at a zone's edge (a locked one's wall stops you there).
      trainZoneNear: zoneAt(p.x, p.z, 1.6),
      sphinx: Math.hypot(p.x - SPHINX_STAND.x, p.z - SPHINX_STAND.z) < 5.5,
      pad: padAt(p.x, p.z),
      egg: egg ? egg.eggId : null,
      portal: portalAt(p.x, p.z)?.id ?? null,
      freeReward: Math.hypot(p.x - FREE_REWARD.x, p.z - FREE_REWARD.z) < FREE_REWARD.radius,
      auras: near(AURA_STAND, p),
      potions: near(POTION_STAND, p),
      // At the bars of the next cage, and which room of the gauntlet you're in (-1: neither).
      cage: cageHere(p),
      room: roomAt(p.x, p.z, CAGES.length),
    }
    // On a WIN pad: cash in.
    checkPad(p)
    if (!sameZone(zone, game.zone)) {
      if (zone.portal && zone.portal !== game.zone.portal) actions.portal()
      game.setZone(zone)
    }

    if (zone.trainZone !== lastZone) {
      if (zone.trainZone >= 0 && isZoneUnlocked(game.profile, zone.trainZone)) {
        actions.enterZone(zone.trainZone)
        sfx.zoneEnter()
      } else if (lastZone >= 0) actions.leaveZone()
      lastZone = zone.trainZone
    }
  }

  const id = setInterval(tick, TICK_MS)
  return () => {
    clearInterval(id)
    unsubscribe()
  }
}
