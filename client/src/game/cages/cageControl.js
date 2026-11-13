import { BREAK, CAGE_REACH, PAD_SLACK } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { breakProgress, canBreak, canSmash, hitPower, padWins } from '@shared/logic'
import { atCage, CAGE_RETURN, cageDoorRect, cageWallZ, gauntletColliders, inRect, MAX_CAGES, roomAt, SPAWN, winPadRect } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame } from '../../store/game'
import { fadeThrough } from '../../ui/fade'
import { iconUrl } from '../../ui/icons'
import { flyWins } from '../../ui/winsFly'
import { burst } from '../fx/fxQueue'
import { spawnPopup } from '../fx/popups'
import { runtime } from '../runtime'
import { CAGES } from './course'
import { cageTheme } from './themes'

/** Standing on a WIN pad, a claim goes again this often until the authority answers. */
const CLAIM_RETRY_MS = 900
/** Strong enough to smash a cage: it bursts once you're this close to its bars. */
const SMASH_REACH = 1.2
const SMASH_RETRY_MS = 250
/** Paid on a WIN pad: this long celebrating there before the fade home. */
const WIN_HOLD_MS = 650
/** Back in the lobby, this far into the dance the Wins start flying home to the counter. */
const FLY_HOME_MS = 550
/** How long a broken cage's bars take to bend open (Cages.jsx). */
export const OPEN_MS = 520

const TROPHY = iconUrl('trophy')

/**
 * Your run, as this client sees it: which cages stand open (the authority's word - it
 * says when one breaks), the break bar of the one you're at, and the WIN pad you're
 * cashing in on. Read every frame by the controller, the gauntlet and the HUD; written
 * by taps, the authority's events and the 10 Hz ticker - never React state.
 */
export const run = {
  /** Cages broken this run, in order: cage `broken` is the next to break. */
  broken: 0,
  /** performance.now() each cage broke this run (0: still whole), for its bars' bend. */
  brokenAt: new Float64Array(MAX_CAGES),
  /** Bumped whenever the cages change: whoever draws them redraws. */
  version: 0,
  /**
   * The break bar: the cage it's for, how full it was at `at` (the authority's word plus
   * the taps it hasn't answered yet, `pending`).
   */
  bar: { cage: -1, value: 0, at: 0, pending: 0 },
  /** The WIN pad claim in flight: its room (-1 none), and when it was last sent. */
  claim: { pad: -1, at: 0 },
  /** The room whose pad was celebrated this run (-1 none): once, whether we saw it first or the authority did. */
  celebrated: -1,
  /** Between a WIN pad paying out and landing back in the lobby. */
  homeward: false,
  smashAt: 0,
}

/** The gauntlet's walls and every cage still standing, for the controller to bump into. */
export function syncCageColliders() {
  runtime.gauntletWalls = gauntletColliders(CAGES.length)
  const doors = []
  for (let i = run.broken; i < CAGES.length; i += 1) doors.push(cageDoorRect(i))
  runtime.cageDoors = doors
}

/** Every cage whole again: a new run (back home, a new world, a reconnect). */
export function resetRun() {
  run.broken = 0
  run.brokenAt.fill(0)
  run.bar = { cage: -1, value: 0, at: 0, pending: 0 }
  run.claim = { pad: -1, at: 0 }
  run.celebrated = -1
  run.homeward = false
  run.version += 1
  syncCageColliders()
}

/** The cage you're in front of, close enough to hit: its index, or -1. */
export function cageHere(p = runtime.player.position) {
  const i = run.broken
  if (run.homeward || i >= CAGES.length) return -1
  return atCage(i, p.x, p.z, CAGE_REACH) ? i : -1
}

/** The break bar now (0-1): its last value, drained since. */
export function barValue() {
  const bar = run.bar
  if (bar.cage < 0 || bar.cage !== run.broken) return 0
  return Math.max(0, bar.value - (BREAK.decay * (performance.now() - bar.at)) / 1000)
}

/**
 * A tap at the bars of the cage you're at: a heave on them, the groan of the metal and the
 * bar's jump straight away; the authority's answer puts the bar right. Returns false
 * when you're at no cage (so the tap is a lift).
 */
export function hitCage() {
  const i = cageHere()
  if (i < 0) return false
  const need = CAGES[i].need
  const muscle = getGame().profile.muscle
  const now = performance.now()
  runtime.player.pullAt = now
  const value = Math.min(0.99, breakProgress(barValue(), 0, muscle, need))
  run.bar = { cage: i, value, at: now, pending: run.bar.cage === i ? run.bar.pending + 1 : 1 }
  if (canBreak(muscle, need)) sfx.pull(value)
  else sfx.tooWeak()
  actions.hit()
  return true
}

/** The authority's answer to a tap: the bar as it has it, plus our taps still on their way. */
export function onCageHit({ cage, progress }) {
  if (cage !== run.broken) return
  const bar = run.bar
  const pending = bar.cage === cage ? Math.max(0, bar.pending - 1) : 0
  const muscle = getGame().profile.muscle
  run.bar = { cage, value: Math.min(0.99, progress + pending * hitPower(muscle, CAGES[cage].need)), at: performance.now(), pending }
}

/** Cage `cage` broke: its bars spring open with a crash and a shower of bits of it. */
export function onCageBroken({ cage }) {
  if (cage < run.broken || cage >= CAGES.length) return
  run.broken = cage + 1
  run.brokenAt[cage] = performance.now()
  run.bar = { cage: -1, value: 0, at: 0, pending: 0 }
  run.version += 1
  syncCageColliders()
  sfx.cageBreak()
  const theme = cageTheme(CAGES[cage].id)
  const z = cageWallZ(cage)
  burst({ x: 0, y: 1.6, z, count: 46, speed: 9, colors: [theme.bars, theme.accent, '#ffffff'] })
  burst({ x: 0, y: 3.5, z, count: 24, speed: 6, palette: 'gold' })
  showBanner({ kind: 'smash', cage })
}

/** Deferred: reached from the frame loop, which must never update React state. */
const showBanner = (banner) => setTimeout(() => getGame().showBanner(banner), 0)

/**
 * Walking into a cage you're strong enough to smash (BREAK.smash times its need): its
 * bars bend open without a tap. Called by the controller every frame; cheap.
 */
export function trySmash(p) {
  const i = run.broken
  if (run.homeward || i >= CAGES.length) return
  if (!canSmash(getGame().profile.muscle, CAGES[i].need)) return
  if (!atCage(i, p.x, p.z, SMASH_REACH)) return
  const now = performance.now()
  if (now - run.smashAt < SMASH_RETRY_MS) return
  run.smashAt = now
  actions.hit()
}

/**
 * Standing on the WIN pad of a room you've broken into: claimed (again every
 * CLAIM_RETRY_MS until the authority answers) and celebrated straight away. Called by
 * the 10 Hz ticker.
 */
export function checkPad(p) {
  if (run.homeward) return
  const room = roomAt(p.x, p.z, CAGES.length)
  if (room < 0 || room >= run.broken || !inRect(winPadRect(room), p.x, p.z, PAD_SLACK)) {
    run.claim.pad = -1
    return
  }
  const now = performance.now()
  if (run.claim.pad === room && now - run.claim.at < CLAIM_RETRY_MS) return
  run.claim = { pad: room, at: now }
  actions.claimPad(room, Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100)
  celebrate(room, padWins(getGame().profile, room, Date.now()))
}

/**
 * WIN pad `room` cashed in for `wins`, once a run: the banner, the fanfare, a fountain of
 * gold, and the Wins counter held where it was for the Wins to fly home to.
 */
function celebrate(room, wins) {
  if (run.celebrated === room) return
  run.celebrated = room
  const p = runtime.player.position
  sfx.wins()
  burst({ x: p.x, y: p.y + 2.5, z: p.z, count: 50, palette: 'gold', speed: 9 })
  spawnPopup(`+${formatNumber(wins)}`, { x: p.x, y: p.y + 2.8, z: p.z }, { iconUrl: TROPHY, scale: 1.4, follow: p })
  const before = getGame().profile.wins
  getGame().holdWins(before)
  setTimeout(() => getGame().showWins(), 12000)
  getGame().showBanner({ kind: 'win', wins })
}

/** The authority paid WIN pad `pad`: a moment's celebration, then the fade home. */
export function onPadReward({ pad, wins, last }) {
  celebrate(pad, wins)
  if (run.homeward) return
  run.homeward = true
  runtime.player.frozen = true
  setTimeout(() => fadeThrough(() => home(wins, last)), WIN_HOLD_MS)
}

/**
 * Back in the lobby, short of the first cage and turned to the camera, dancing, every
 * cage whole again - while the `wins` cashed in fly home to the HUD.
 */
function home(wins, last) {
  resetRun()
  const player = runtime.player
  player.position.set(CAGE_RETURN.x, 0, CAGE_RETURN.z)
  player.yaw = 0
  player.danceAt = performance.now()
  player.frozen = false
  runtime.camera.yaw = 0
  runtime.camera.snap = true
  burst({ x: CAGE_RETURN.x, y: 1.4, z: CAGE_RETURN.z, count: 60, palette: 'confetti', speed: 8 })
  if (wins > 0) setTimeout(() => flyWins(wins), FLY_HOME_MS)
  if (last) getGame().showBanner({ kind: 'escaped' })
}

/**
 * Boxity's "Reset Character": straight back to the spawn point, every cage whole again
 * (the authority does the same).
 */
export function resetCharacter() {
  actions.respawn()
  resetRun()
  runtime.player.frozen = false
  runtime.player.position.set(SPAWN.x, 0, SPAWN.z)
  runtime.player.yaw = Math.PI
}
