import { Vector3 } from 'three'

import { GRAB_REACH, PUSH_SPEED, PUSH_START, ROLLBACK_SPEED, WIN_PAD } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { onWinPad, winsMultiplier } from '@shared/logic'
import { PUSH_RETURN, PUSH_ZONE, SPAWN, TRACK_HALF_WIDTH } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { closeDeathScreen, openDeathScreen } from '../../bloxity/deathScreen'
import { actions } from '../../net/actions'
import { getGame } from '../../store/game'
import { fadeThrough } from '../../ui/fade'
import { iconUrl } from '../../ui/icons'
import { flyWins } from '../../ui/winsFly'
import { burst } from '../fx/fxQueue'
import { spawnPopup } from '../fx/popups'
import { runtime } from '../runtime'
import { isSlope, ORBS_ON, safeStart, STAGES, stageCost, stageStart, stageTop, TRACK_LENGTH, WIN_PADS } from './course'
import { boulderGap, boulderRadius, feetPoint, floorY, meterAtZ, trackPoint, zAt } from './path'

/** Position reports to the authority while on the mountain, and at least this often while resting. */
const REPORT_MS = 200
const KEEPALIVE_MS = 5000
/** Sideways steering speed, m/s. */
const STEER_SPEED = 5.5
/** Let go of the boulder this long and it starts rolling back. */
const LET_GO = 0.35
/** How long THE TOP's celebration plays before you're back down. */
const TOP_HOLD_MS = 3800
/** On a WINS pad: how long to celebrate (the Wins flying home) before it's back to the lobby. */
const WIN_HOLD_MS = 700
/** Back in the lobby after cashing in: this long into the dance, the Wins start flying home. */
const FLY_HOME_MS = 550
/** The boulder rolls back over you in this long. */
const CRUSH_ROLL_MS = 520
/** The last of your power, as a share of what you started with: you strain, the counter goes red. */
export const LOW_POWER = 0.15
/** How far in from the track's walls you can walk in a SAFEZONE. */
const SAFE_X = TRACK_HALF_WIDTH - 1

/**
 * The climb in progress, read every frame by the player, the camera, the track, the
 * boulders and their effects. It alternates between pushing a stage's boulder up its
 * slope ('push') and walking about the flat SAFEZONE above without one ('free'), until
 * you're crushed, cash in, reach THE TOP or go back to the Lobby.
 *
 * Each push is its own: the authority tells us its power (your Muscle when you took the
 * boulder) and how far that gets it. Hold forward to push, let go and it rolls back down
 * the slope; every half metre takes a power (more on the heavier boulders past the
 * third). The moment the power's gone, the boulder rolls back over you - and you're
 * back in the Lobby, whatever stage it was on. Over the top,
 * the boulder's done with and you're free in the SAFEZONE, with full power for the next.
 *
 * Your logical position stays on the PUSH ZONE in the plaza throughout (that's what the
 * server checks of it); only what's drawn goes up the mountain, and where that is we
 * report as we go.
 */
export const push = {
  active: false,
  /** 'push' | 'free' (in a SAFEZONE) | 'crushed' (out of power: it rolled back over you) | 'top' (you made it!) */
  phase: 'push',
  startedAt: 0,
  /** The power this push started with (your Muscle when you took the boulder), and the furthest metre it reaches. */
  power: 0,
  reach: 0,
  /** Where this push started: just short of the foot of its slope. */
  start: PUSH_START,
  /** Where your feet are along the track, and across it. */
  meter: PUSH_START,
  x: 0,
  /** Metres a second along the track (+ is uphill). */
  speed: 0,
  /** Forward input this frame, 0-1, for the pose and sound. */
  effort: 0,
  /** 0-1: straining as the last of your power runs out. */
  strain: 0,
  /** Pushing, the stage whose boulder it is; free, the stage the SAFEZONE leads up to. */
  stage: 0,
  /** The boulder's middle along the track, and how far it has turned. */
  boulderMeter: 0,
  roll: 0,
  /** When the boulder rolled back over you, and how far through that (0-1). */
  crushedAt: 0,
  crush: 0,
  /** When the push was decided: crushed, or THE TOP reached. */
  endedAt: 0,
  /** WINS pads celebrated this climb, by stage. */
  celebrated: [],
  /** Wins orbs taken this climb, by index. */
  orbsTaken: new Set(),
  idle: 0,
  /** Set once we've told the authority it's over, so its echo isn't handled twice. */
  ending: false,
  /** Where your feet are (walked about in a SAFEZONE), and the boulder's middle. */
  position: new Vector3(),
  boulderPosition: new Vector3(),
}

let reportTimer = null
let holdTimer = null
let lastReport = { meter: NaN, x: NaN, at: 0 }

function clearTimers() {
  clearInterval(reportTimer)
  clearTimeout(holdTimer)
  reportTimer = null
  holdTimer = null
}

/**
 * Shows a banner, and tells the HUD what you're up to. Deferred to a timer: these are
 * reached from the frame loop, which must never update React state itself.
 */
const showBanner = (banner) => setTimeout(() => getGame().showPushBanner(banner), 0)
const setClimb = (climb) => setTimeout(() => getGame().setClimb(climb), 0)

/** How far across the track a boulder of `stage` may go: clear of the SAFEZONE arches' posts. */
const maxX = (stage) => TRACK_HALF_WIDTH - boulderRadius(stage) - 1.1

/** How high a Wins orb floats over the track. */
export const ORB_HEIGHT = 1.3
/** How close across the track the boulder must come to an orb to take it: a share of its radius. */
const ORB_REACH = 0.45
/**
 * How far across the track Wins orb `orb` floats: out on its side, past the middle of
 * the boulder steered all the way over - so it takes steering to, whatever its size.
 */
export const orbX = (orb) => orb.side * (maxX(orb.stage) + boulderRadius(orb.stage) * 0.4)

/**
 * Tells the authority where we've got to, when that's changed - and every few seconds
 * regardless, so resting in a SAFEZONE isn't taken for a dropped climb.
 */
function report() {
  if (!push.active) return
  const meter = Math.round(push.meter * 100) / 100
  const x = Math.round(push.x * 100) / 100
  const now = performance.now()
  if (meter === lastReport.meter && x === lastReport.x && now - lastReport.at < KEEPALIVE_MS) return
  lastReport = { meter, x, at: now }
  actions.pushAt(meter, x)
}

/** Places the pusher and the boulder from the push's numbers. */
function place() {
  feetPoint(push.meter, push.x, push.position)
  trackPoint(push.boulderMeter, push.x, boulderRadius(push.stage), push.boulderPosition)
}

/** Power left: pushing, what you took the boulder with less what the climb's taken; else your Muscle. */
export function powerLeft() {
  if (!push.active || push.phase === 'free') return getGame().profile.muscle
  return Math.max(0, push.power - stageCost(push.stage, push.meter))
}

/**
 * Takes the boulder the authority gave us: the first stage's from the plaza (a new
 * climb), or the next one's from a SAFEZONE.
 */
export function beginPush({ stage = 0, reach, power, start, x }) {
  const fresh = !push.active
  clearTimeout(holdTimer)
  Object.assign(push, {
    active: true,
    phase: 'push',
    startedAt: performance.now(),
    stage,
    power,
    reach,
    start,
    cashWins: 0,
    meter: start,
    x: Math.max(-maxX(stage), Math.min(maxX(stage), x)),
    speed: 0,
    effort: 0,
    strain: 0,
    roll: 0,
    crushedAt: 0,
    crush: 0,
    endedAt: 0,
    idle: 0,
    ending: false,
  })
  push.boulderMeter = push.meter + boulderGap(stage)
  place()
  runtime.player.frozen = true
  runtime.camera.mode = 'push'
  runtime.focus = push.position
  if (fresh) {
    push.celebrated = []
    push.orbsTaken.clear()
    lastReport = { meter: NaN, x: NaN, at: 0 }
    getGame().setPushing(true)
    reportTimer = setInterval(report, REPORT_MS)
  }
  getGame().setClimb('push')
  sfx.pushStart()
  sfx.rollStart()
}

/**
 * Celebrates the WINS pad you're standing on, if you haven't yet this climb (the
 * authority pays it). Returns whether there was one.
 */
function collect() {
  for (const pad of WIN_PADS) {
    if (push.celebrated.includes(pad.stage) || !onWinPad(pad, push.meter, push.x, WIN_PAD.slack)) continue
    celebrate(pad, Math.round(pad.wins * winsMultiplier(getGame().profile, Date.now())))
    return true
  }
  return false
}

/**
 * WINS pad `pad` cashed in for `wins`, once a climb: the banner, the fanfare, a burst of
 * gold, and the Wins counter held for the Wins to fly home to once you're back in the
 * lobby.
 */
function celebrate(pad, wins) {
  if (push.celebrated.includes(pad.stage)) return
  push.celebrated.push(pad.stage)
  const top = pad.stage === STAGES.length - 1
  showBanner({ kind: top ? 'top' : 'clear', stage: pad.stage, wins })
  push.cashWins = wins
  // The counter stays at what you had (read now, before the authority pays) until they
  // land - set after the frame, and let go of in the end, whatever happens.
  const before = getGame().profile.wins
  setTimeout(() => getGame().holdWins(before), 0)
  setTimeout(() => getGame().showWins(), 12000)
  sfx.wins()
  burst({ x: push.position.x, y: push.position.y + 2.5, z: push.position.z, count: top ? 80 : 50, palette: 'gold', speed: top ? 11 : 9 })
}

/**
 * The authority paid WINS pad `stage` - it can see you on it a moment before we do (a
 * jump onto it, say): celebrate it here too, with what it paid.
 */
export function padRewarded({ stage, wins }) {
  if (!push.active) return
  const pad = WIN_PADS.find((p) => p.stage === stage)
  if (pad) celebrate(pad, wins)
}

/** Cashed in on a WINS pad: a moment's burst of gold, then back to the lobby - dancing, the Wins flying home. */
function cashIn() {
  push.ending = true
  report()
  holdTimer = setTimeout(() => {
    actions.endPush('win')
    fadeThrough(() => finishPush(PUSH_RETURN, true, push.cashWins))
  }, WIN_HOLD_MS)
}

/** Free in the SAFEZONE leading up to stage `stage`, standing at `meter`; the orbit camera follows you. */
function freeAt(stage, meter) {
  push.phase = 'free'
  push.stage = stage
  push.meter = meter
  push.x = Math.max(-SAFE_X, Math.min(SAFE_X, push.x))
  push.speed = 0
  push.effort = 0
  push.strain = 0
  push.crush = 0
  push.ending = false
  place()
  runtime.camera.mode = 'follow'
  runtime.camera.yaw = 0
  report()
  setClimb('free')
}

/**
 * Walking in a SAFEZONE: keeps `pos` (your feet, which the player moves) on its floor,
 * between its arch and the next boulder, and works out where along the track that is.
 * Returns the floor's height.
 */
export function walkSafezone(pos) {
  const lo = safeStart(push.stage)
  const hi = stageStart(push.stage) + PUSH_START
  pos.x = Math.max(-SAFE_X, Math.min(SAFE_X, pos.x))
  pos.z = Math.max(zAt(hi), Math.min(zAt(lo), pos.z))
  push.meter = meterAtZ(pos.z)
  push.x = pos.x
  if (!push.ending && collect()) cashIn()
  return floorY(lo)
}

/** Whether you're in a SAFEZONE close enough to the next boulder to take it (and not cashing in). */
export const atNextBoulder = () =>
  push.active && push.phase === 'free' && !push.ending && push.meter >= stageStart(push.stage) + PUSH_START - GRAB_REACH

/**
 * Moves the push on by `delta` seconds with this frame's input: `forward` and `back`
 * 0-1, `side` -1..1. Called by the player's frame loop while pushing.
 */
export function advancePush(delta, { forward, back, side }) {
  // On the way out (a fade back down), the push holds still.
  if (!push.active || push.phase === 'free' || (push.ending && push.phase === 'push')) return
  const now = performance.now()

  if (push.phase === 'crushed') {
    // The boulder rolls back down the slope, right over you.
    push.crush = Math.min(1, (now - push.crushedAt) / CRUSH_ROLL_MS)
    const slip = push.crush * push.crush * (boulderGap(push.stage) + 3.5)
    const before = push.boulderMeter
    push.boulderMeter = push.meter + boulderGap(push.stage) - slip
    push.roll += (push.boulderMeter - before) / boulderRadius(push.stage)
    push.speed = 0
    push.effort = 0
    place()
    sfx.rollSet(push.crush < 1 ? 0.8 : 0, 0, boulderRadius(push.stage))
    return
  }
  if (push.phase === 'top') {
    push.speed = 0
    push.effort = 0
    place()
    sfx.rollSet(0, 0)
    return
  }

  // --- Pushing, letting go, steering ---------------------------------------------
  // Let go on the slope and the boulder rolls back down it.
  const onSlope = isSlope(push.meter)
  let target = 0
  push.effort = forward
  if (forward > 0.1) {
    target = PUSH_SPEED * forward
    push.idle = 0
  } else {
    push.idle += delta
    if (back > 0.1) target = -ROLLBACK_SPEED * 1.25
    else if (push.idle > LET_GO && onSlope) target = -ROLLBACK_SPEED
  }
  push.speed += (target - push.speed) * (1 - Math.exp(-6 * delta))
  let meter = push.meter + push.speed * delta
  // Back where you took it, backing away lets go of it: back to the plaza from the
  // first stage, free in the SAFEZONE from the others.
  if (meter < push.start) {
    if (back > 0.1) {
      letGo()
      return
    }
    meter = push.start
    push.speed = Math.max(0, push.speed)
  }
  if (meter >= push.reach) {
    meter = push.reach
    push.speed = Math.min(0, push.speed)
  }
  push.meter = meter
  push.x = Math.max(-maxX(push.stage), Math.min(maxX(push.stage), push.x + side * STEER_SPEED * delta))
  const before = push.boulderMeter
  push.boulderMeter = push.meter + boulderGap(push.stage)
  push.roll += (push.boulderMeter - before) / boulderRadius(push.stage)
  place()
  collectOrbs()

  // --- Over the top, THE TOP, or out of power ---------------------------------------
  if (push.meter >= stageTop(push.stage) - 0.005) {
    if (push.meter >= TRACK_LENGTH - 0.005) {
      collect()
      push.phase = 'top'
      push.endedAt = now
      sfx.rollStop()
      holdTimer = setTimeout(() => endPush('top'), TOP_HOLD_MS)
    } else {
      overTheTop()
    }
    return
  }
  // The last of your power, up a slope: you strain. None left, and the boulder wins.
  const low = Math.max(1, push.power * LOW_POWER)
  push.strain = forward > 0.1 && onSlope ? Math.min(1, Math.max(0, 1 - powerLeft() / low)) : 0
  sfx.rollSet(Math.abs(push.speed) / PUSH_SPEED, push.strain, boulderRadius(push.stage))
  if (push.meter >= push.reach) crushed(now)
}

const _orb = new Vector3()
const TROPHY = iconUrl('trophy')

/**
 * Wins orbs the boulder's rolling into: each taken once a climb (the authority pays it,
 * where we are told it first), with a pop of gold, a chime and the Wins rising off it.
 */
function collectOrbs() {
  const r = boulderRadius(push.stage)
  for (const orb of ORBS_ON[push.stage] ?? []) {
    if (push.orbsTaken.has(orb.index)) continue
    if (Math.abs(orb.meter - push.boulderMeter) > r * 0.6 || Math.abs(orbX(orb) - push.x) > r * ORB_REACH) continue
    push.orbsTaken.add(orb.index)
    report()
    actions.collectOrb(orb.index)
    trackPoint(orb.meter, orbX(orb), ORB_HEIGHT, _orb)
    burst({ x: _orb.x, y: _orb.y, z: _orb.z, count: 12, palette: 'gold', speed: 5 })
    const wins = Math.max(1, Math.round(orb.wins * winsMultiplier(getGame().profile, Date.now())))
    spawnPopup(`+${formatNumber(wins)}`, _orb, { iconUrl: TROPHY, follow: push.position })
    sfx.trophy()
  }
}

/** Over the top of a slope: the boulder's done with, and you're free in the SAFEZONE above. */
function overTheTop() {
  const b = push.boulderPosition
  burst({ x: b.x, y: b.y, z: b.z, count: 40, palette: 'gold', speed: 8 })
  sfx.boulderPop()
  sfx.rollStop()
  freeAt(push.stage + 1, stageTop(push.stage))
}

/** Out of power: the boulder rolls back over you, and you're back in the Lobby. */
function crushed(now) {
  push.phase = 'crushed'
  push.crushedAt = now
  push.endedAt = now
  push.strain = 1
  sfx.crush()
  burst({ x: push.position.x, y: push.position.y + 0.6, z: push.position.z, count: 30, palette: 'confetti', speed: 6 })
  // The climb's over: the authority hears now (everyone sees you gone from the boulder),
  // but you lie crushed until you respawn - from Boxity's death screen, back to the lobby.
  push.ending = true
  report()
  actions.endPush('crushed')
  const stage = push.stage
  holdTimer = setTimeout(() => {
    sfx.rollStop()
    openDeathScreen({ stage, need: STAGES[stage]?.need ?? 0 }, () => fadeThrough(() => finishPush()))
  }, CRUSH_ROLL_MS + 250)
}

/**
 * Boxity's "Reset Character": straight back, no countdown. Crushed, or up the mountain,
 * that's the lobby; in the lobby, the spawn point.
 */
export function resetCharacter() {
  if (getGame().death) {
    closeDeathScreen()
    fadeThrough(() => finishPush())
    return
  }
  if (push.active) {
    if (push.ending) return
    endPush('left')
    return
  }
  actions.respawn()
  runtime.player.position.set(SPAWN.x, 0, SPAWN.z)
  runtime.player.yaw = Math.PI
}

/**
 * Backed off the foot of a slope, letting go of the boulder: into the plaza from the
 * first, free in the SAFEZONE from any other. (Finished on a timer from the first: this
 * is reached from the frame loop.)
 */
function letGo() {
  if (push.ending) return
  report()
  sfx.rollStop()
  if (push.stage === 0) {
    push.ending = true
    actions.endPush('left')
    const at = { x: push.x, z: PUSH_ZONE.maxZ + 1.4 }
    setTimeout(() => finishPush(at), 0)
    return
  }
  actions.endPush('release')
  freeAt(push.stage, push.start)
}

/** Ends the climb on our side: tells the authority, then fades back to the plaza. */
export function endPush(reason) {
  if (!push.active || push.ending) return
  push.ending = true
  report()
  actions.endPush(reason)
  const top = reason === 'top'
  fadeThrough(() => finishPush(PUSH_RETURN, top, top ? push.cashWins : 0))
}

/**
 * The authority ended the climb: finish it here too, unless we already are. Cashed in on
 * a WINS pad (it saw you on it first), the same way home as when we see it first: a
 * moment's celebration, then the lobby - dancing, the Wins flying home. At THE TOP we're
 * celebrating already, and endPush takes us home when that's done.
 */
export function pushEndedByServer(reason) {
  if (!push.active || push.ending) return
  const cashed = reason === 'win' || reason === 'top'
  if (cashed && push.phase === 'top') return
  push.ending = true
  if (cashed) {
    clearTimeout(holdTimer)
    holdTimer = setTimeout(() => fadeThrough(() => finishPush(PUSH_RETURN, true, push.cashWins)), WIN_HOLD_MS)
    return
  }
  fadeThrough(() => finishPush())
}

/**
 * Back in the plaza: just short of the push zone, camera behind you - turned to it and
 * dancing, with `dance`, after a win, while the `wins` cashed in fly home to the HUD.
 */
export function finishPush(at = PUSH_RETURN, dance = false, wins = 0) {
  clearTimers()
  push.active = false
  push.ending = false
  sfx.rollStop()
  runtime.focus = null
  const player = runtime.player
  player.position.set(at.x, 0, at.z)
  player.yaw = dance ? 0 : Math.PI
  player.danceAt = dance ? performance.now() : 0
  if (dance) {
    // Home in style: a shower of confetti, and what you won over your head.
    burst({ x: at.x, y: 1.4, z: at.z, count: 60, palette: 'confetti', speed: 8 })
    if (wins > 0) spawnPopup(`+${formatNumber(wins)} WINS!`, _orb.set(at.x, 2.6, at.z), { iconUrl: TROPHY, scale: 1.6, life: 2200 })
  }
  if (wins > 0) setTimeout(() => flyWins(wins), FLY_HOME_MS)
  player.frozen = false
  runtime.camera.mode = 'follow'
  runtime.camera.yaw = 0
  runtime.camera.snap = true
  getGame().setClimb(null)
  getGame().setPushing(false)
}
