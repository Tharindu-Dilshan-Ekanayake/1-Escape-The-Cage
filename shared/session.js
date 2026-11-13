import {
  DUMBBELLS,
  EGGS,
  GRAB_REACH,
  ITEMS,
  LIFT_BURST,
  MAX_LIFTS_PER_SECOND,
  MULTI_HATCH,
  PUSH_SPEED_MAX,
  PUSH_START,
  PUSH_TIMEOUT_MS,
  SHOP,
  TRAIN_INTERVAL,
  TRAIN_ZONES,
  WIN_PAD,
  WORLD_PORTALS,
} from './balance.js'
import {
  advanceTutorial,
  applyLift,
  applyRebirth,
  applyTrain,
  awardBadge,
  buyDumbbell,
  buyMusclePack,
  buyShopItem,
  claimDaily,
  claimFreeReward,
  claimPlaytime,
  createSession,
  deletePet,
  equipAura,
  equipBestPets,
  equipDumbbell,
  equipPet,
  hatchEgg,
  isMaxLevel,
  isZoneUnlocked,
  onWinPad,
  skipRebirth,
  trackOf,
  TRACKS,
  unequipPet,
  usePotion,
  winsMultiplier,
  worldUnlocked,
} from './logic.js'
import {
  DUMBBELL_PADS,
  eggStandNear,
  FREE_REWARD,
  inPushZone,
  inRect,
  MAX_MOVE_SPEED,
  padRect,
  portalAt,
  TRACK_HALF_WIDTH,
  benchAt,
} from './world.js'

const DUMBBELL_INDEX = Object.fromEntries(DUMBBELLS.map((d, i) => [d.id, i]))

/** How far outside a Train Zone still counts as "on" it (network jitter). */
/** A seated player's reported position may wander this far off the bench (lag). */
const SEAT_SLACK = 0.5
/** Same for the push zone. */
const PUSH_SLACK = 1.5
/** Pads are bought by standing on them; allow for a little lag. */
const PAD_SLACK = 2
/** How far to either side of the track a pusher may report being. */
const TRACK_X = TRACK_HALF_WIDTH - 1

/**
 * One player's authoritative session: validates intents, runs the training tick and
 * reports what happened through `emit`.
 *
 * Transport-agnostic on purpose. The Colyseus room wraps one of these per client; the
 * offline mode wraps one for the local player. Either way the rules that run are
 * byte-for-byte the same.
 *
 * Events emitted (type, payload):
 * - 'profile'    { profile, session }  full state, after anything structural
 * - 'train'      { source, zone, gain, muscle, level, leveledUp, maxed }  each Muscle
 *                  gain; `source` is 'lift' (a click) or 'zone' (training in Train
 *                  Zone `zone`). Walking earns nothing.
 * - 'push'       { stage, reach, power, start, x }  you've taken stage `stage`'s boulder:
 *                  your power (your Muscle now) and how far it pushes it before it runs out
 * - 'pushReward' { wins, stage, top }  Wins for the WINS pad just walked onto
 * - 'orb'        { index, wins }  Wins for the Wins orb just pushed into
 * - 'pushEnd'    { reason }  the climb is over, back in the plaza ('crushed', 'left',
 *                  'top', 'timeout')
 * - 'pack'       { amount }  a Muscle pack landed
 * - 'hatch'      { eggId, pets: [{ uid, id }] }  pets to reveal
 * - 'badge'      { id, name }
 *
 * A climb up the mountain alternates between pushing a stage's boulder ('push') and
 * walking about a SAFEZONE without one ('free'). `onPush(push | null)` lets the host
 * show other players where someone is on it.
 */
export class PlayerSession {
  /**
   * @param {object} profile normalized profile (see logic.normalizeProfile)
   * @param {{ now: number, emit: (type: string, payload?: object) => void,
   *           getPosition: () => {x: number, y: number, z: number},
   *           onPurchase?: (productId: string) => boolean,
   *           onPush?: (push: object | null) => void }} options
   *   `onPurchase` lets the host veto or count a shop sale (stock limits).
   */
  constructor(profile, { now, emit, getPosition, onPurchase, onPush }) {
    this.profile = profile
    this.session = createSession(now)
    this.emit = emit
    this.getPosition = getPosition
    this.onPurchase = onPurchase
    this.onPush = onPush

    /** Train Zone the client says it's in; verified against position every tick. */
    this.zone = -1
    this.trainTimer = 0
    /**
     * The climb in progress: { phase: 'push' | 'free', stage, startedAt, start, power,
     * reach, meter, x, lastReportAt, lastMoveAt, paidPads }. Pushing, `stage` is the
     * boulder's; free, it's the stage the SAFEZONE leads up to.
     */
    this.push = null
    /** Wins earned climbing (WINS pads and orbs) not yet counted towards a leaderboard. */
    this.winsEarned = 0
    /** Server time until which a new push can't start (just after one ended). */
    this.busyUntil = 0
    /** Lifts banked (a token bucket refilling at MAX_LIFTS_PER_SECOND), and when last refilled. */
    this.liftTokens = LIFT_BURST
    this.liftRefilledAt = now
    this.dirty = false
  }

  // --- Plumbing --------------------------------------------------------------------

  sendProfile() {
    this.dirty = false
    this.emit('profile', { profile: this.profile, session: this.session })
  }

  badge(id) {
    const badge = awardBadge(this.profile, id)
    if (badge) {
      this.dirty = true
      this.emit('badge', badge)
    }
  }

  tutorial(event) {
    if (advanceTutorial(this.profile, event)) this.dirty = true
  }

  // --- Intents ---------------------------------------------------------------------

  /** Dispatches one client message. Unknown types are ignored. */
  handle(type, payload = {}, now) {
    const handler = this.handlers[type]
    if (!handler) return
    handler.call(this, payload || {}, now)
    if (this.dirty) this.sendProfile()
  }

  handlers = {
    enterZone({ zone }) {
      const index = Number(zone)
      if (!Number.isInteger(index) || !TRAIN_ZONES[index]) return
      if (!isZoneUnlocked(this.profile, index)) return
      if (this.zone !== index) {
        this.zone = index
        // The first lift lands a beat after stepping on, not instantly.
        this.trainTimer = TRAIN_INTERVAL * 0.5
      }
    },

    leaveZone() {
      this.zone = -1
    },

    /** One click: a lift with your dumbbell, worth more in a Train Zone. */
    lift(_payload, now) {
      this.liftTokens = Math.min(LIFT_BURST, this.liftTokens + ((now - this.liftRefilledAt) / 1000) * MAX_LIFTS_PER_SECOND)
      this.liftRefilledAt = now
      if (this.liftTokens < 1) return
      this.liftTokens -= 1
      const zone = !this.push && this.onClaimedZone() ? this.zone : -1
      this.gain('lift', zone, applyLift(this.profile, zone, now))
      this.tutorial('lift')
    },

    setting({ key, value }) {
      if (key !== 'autoRebirth') return
      this.profile.settings.autoRebirth = Boolean(value)
      this.dirty = true
    },

    rebirth() {
      if (this.push) return
      const result = applyRebirth(this.profile)
      if (result.ok) this.afterRebirth()
    },

    skipRebirth() {
      if (this.push) return
      const result = skipRebirth(this.profile)
      if (result.ok) this.afterRebirth()
    },

    /**
     * Takes a stage's boulder: the first from the PUSH ZONE in the plaza, each one after
     * from the SAFEZONE below it, standing by it. Its power is all your Muscle now.
     */
    startPush(_payload, now) {
      if (now < this.busyUntil) return
      const climb = this.push
      // A climb stays on the track of the world it started in.
      const track = climb ? TRACKS[climb.world] : trackOf(this.profile)
      let stage = 0
      let x = 0
      if (climb) {
        if (climb.phase !== 'free') return
        if (climb.meter < track.stageStart(climb.stage) + PUSH_START - GRAB_REACH - 1) return
        stage = climb.stage
        x = climb.x
      } else {
        const p = this.getPosition()
        if (!inPushZone(p.x, p.z, PUSH_SLACK)) return
        x = p.x
        this.profile.stats.pushes += 1
      }
      const power = this.profile.muscle
      const start = track.stageStart(stage) + PUSH_START
      const reach = Math.round(track.stageReach(stage, power) * 100) / 100
      x = Math.max(-TRACK_X, Math.min(TRACK_X, x))
      this.push = {
        phase: 'push',
        world: track.index,
        stage,
        startedAt: now,
        start,
        power,
        reach,
        meter: start,
        x,
        lastReportAt: now,
        lastMoveAt: now,
        paidPads: climb?.paidPads ?? [],
        orbs: climb?.orbs ?? [],
      }
      this.zone = -1
      this.emit('push', { stage, reach, power, start, x })
      this.onPush?.(this.push)
      this.dirty = true
      this.tutorial('push')
      this.badge('firstPush')
    },

    /**
     * Where the climber has got to. Pushing, trusted only as far as they could really
     * have got: no further than their power pushes the boulder, nor than pushing flat
     * out since they took it could take them; over the top of the slope they're free in
     * the SAFEZONE above. Free, only within that SAFEZONE and at walking pace. A WINS pad
     * stood on cashes the climb in: it pays for everything climbed, and the climb's over.
     */
    pushAt({ meter, x }, now) {
      const climb = this.push
      if (!climb) return
      const m = Number(meter)
      if (!Number.isFinite(m)) return
      const track = TRACKS[climb.world]
      climb.x = Math.max(-TRACK_X, Math.min(TRACK_X, Number(x) || 0))
      climb.lastReportAt = now
      if (climb.phase === 'push') {
        const allowed = Math.min(climb.reach, climb.start + ((now - climb.startedAt) / 1000) * PUSH_SPEED_MAX + 4)
        climb.meter = Math.max(climb.start - 2, Math.min(m, allowed))
        if (climb.meter >= track.stageTop(climb.stage) - 0.01 && climb.stage < track.stages.length - 1) {
          climb.phase = 'free'
          climb.stage += 1
          climb.lastMoveAt = now
        }
      } else {
        const step = Math.abs(m - climb.meter)
        const dt = Math.max(0.05, (now - climb.lastMoveAt) / 1000)
        if (step <= MAX_MOVE_SPEED * dt + 2) {
          climb.meter = Math.max(track.safeStart(climb.stage), Math.min(m, track.stageStart(climb.stage) + PUSH_START + 0.5))
          climb.lastMoveAt = now
        }
      }
      this.onPush?.(climb)
      const stats = this.profile.stats
      stats.bestMeter = Math.max(stats.bestMeter, Math.round(climb.meter * 10) / 10)

      for (const pad of track.winPads) {
        if (climb.paidPads.includes(pad.stage) || !onWinPad(pad, climb.meter, climb.x, WIN_PAD.slack)) continue
        climb.paidPads.push(pad.stage)
        const wins = Math.max(1, Math.round(pad.wins * winsMultiplier(this.profile, now)))
        const top = pad.stage === track.stages.length - 1
        this.profile.wins += wins
        this.winsEarned += wins
        this.dirty = true
        this.emit('pushReward', { wins, stage: pad.stage, top })
        this.tutorial('cashIn')
        if (pad.stage === 0 && climb.world === 0) this.badge('frozenPeak')
        if (top) {
          stats.tops += 1
          this.badge('top')
        }
        this.finishPush(now, top ? 'top' : 'win')
        return
      }
    },

    /**
     * A Wins orb the boulder's rolled into: paid at once, once a climb - if the climb's
     * really by it: pushing up its stage, just short of it, on its side of the track.
     */
    collectOrb({ index }, now) {
      const climb = this.push
      if (!climb || climb.phase !== 'push') return
      const orb = TRACKS[climb.world].orbs[Number(index)]
      if (!orb || orb.stage !== climb.stage || climb.orbs.includes(orb.index)) return
      if (orb.meter < climb.meter - 3 || orb.meter > climb.meter + 7 || climb.x * orb.side < -0.25) return
      climb.orbs.push(orb.index)
      const wins = Math.max(1, Math.round(orb.wins * winsMultiplier(this.profile, now)))
      this.profile.wins += wins
      this.winsEarned += wins
      this.dirty = true
      this.emit('orb', { index: orb.index, wins })
    },

    /**
     * The push is over. Backing off the foot of a stage above the first, you're free in
     * the SAFEZONE below it; otherwise - crushed on any stage included - the climb's
     * over and you're back in the plaza.
     */
    endPush({ reason }, now) {
      const climb = this.push
      if (!climb) return
      if (climb.phase === 'push' && climb.stage > 0 && reason === 'release') {
        climb.phase = 'free'
        climb.meter = TRACKS[climb.world].stageStart(climb.stage) + PUSH_START
        climb.lastMoveAt = now
        climb.lastReportAt = now
        this.onPush?.(climb)
        return
      }
      this.finishPush(now, ['crushed', 'left', 'top'].includes(reason) ? reason : 'left')
    },

    buyDumbbell({ id }) {
      if (!this.nearPadFor(id)) return
      const result = buyDumbbell(this.profile, id)
      if (!result.ok) return
      this.dirty = true
      if (result.bought) this.tutorial('buyDumbbell')
    },

    equipDumbbell({ id }) {
      const result = equipDumbbell(this.profile, id)
      if (result.ok) this.dirty = true
    },

    equipAura({ id }) {
      if (equipAura(this.profile, id ?? null).ok) this.dirty = true
    },

    buyPack({ index }) {
      const result = buyMusclePack(this.profile, Number(index))
      if (!result.ok) return
      this.dirty = true
      this.emit('pack', { amount: result.amount })
    },

    hatch({ eggId, count }) {
      const egg = EGGS[eggId]
      if (!egg) return
      const p = this.getPosition()
      if (eggStandNear(p.x, p.z)?.eggId !== eggId) return
      const n = count === MULTI_HATCH ? MULTI_HATCH : 1
      this.reveal(hatchEgg(this.profile, eggId, n))
    },

    openEggItem({ itemId }) {
      const item = ITEMS[itemId]
      if (!item || item.kind !== 'egg') return
      this.reveal(hatchEgg(this.profile, item.egg, 1, { paid: 'item' }))
    },

    equipPet({ uid }) {
      if (equipPet(this.profile, Number(uid)).ok) this.dirty = true
    },

    unequipPet({ uid }) {
      unequipPet(this.profile, Number(uid))
      this.dirty = true
    },

    equipBest() {
      equipBestPets(this.profile)
      this.dirty = true
    },

    deletePet({ uid }) {
      if (deletePet(this.profile, Number(uid)).ok) this.dirty = true
    },

    claimDaily({ day }, now) {
      const result = claimDaily(this.profile, Number(day), now)
      this.afterReward(result)
    },

    claimPlaytime({ index }, now) {
      const result = claimPlaytime(this.profile, this.session, Number(index), now)
      this.afterReward(result)
    },

    claimFreeReward() {
      const p = this.getPosition()
      if (Math.hypot(p.x - FREE_REWARD.x, p.z - FREE_REWARD.z) > FREE_REWARD.radius + 1.5) return
      const result = claimFreeReward(this.profile, this.session)
      this.afterReward(result)
    },

    /**
     * Stepping through a world portal: to its world (the first time, with its Wins), or,
     * from that world, back to World 1. Not mid-climb.
     */
    portal() {
      if (this.push) return
      const p = this.getPosition()
      const portal = portalAt(p.x, p.z, 2)
      if (!portal) return
      const there = WORLD_PORTALS[portal.id].world
      const to = this.profile.world === there ? 0 : there
      if (!worldUnlocked(this.profile, to)) return
      if (to === there) this.badge(portal.id)
      this.profile.world = to
      this.dirty = true
      this.emit('world', { world: to })
    },

    usePotion({ itemId }, now) {
      const result = usePotion(this.profile, itemId, now)
      if (!result.ok) return
      this.dirty = true
    },

    /** Buys a SHOP item with Wins. */
    purchase({ productId }) {
      const item = SHOP[productId]
      if (!item) return
      // Checked before the host takes stock, so a short wallet never uses up a Sphinx.
      if (this.profile.wins < item.price) return
      if (item.kind === 'pass' && this.profile.passes[productId]) return
      if (this.onPurchase && !this.onPurchase(productId)) return
      const result = buyShopItem(this.profile, productId)
      if (!result.ok) return
      this.dirty = true
      this.reveal(result)
    },
  }

  afterReward(result) {
    if (!result?.ok) return
    this.dirty = true
    if (result.pets?.length) this.reveal(result)
  }

  /** Sends newly gained pets to the client's hatch animation. */
  reveal(result) {
    if (!result?.ok || !result.pets?.length) return
    this.dirty = true
    this.emit('hatch', { eggId: result.eggId ?? null, pets: result.pets })
    this.tutorial('hatch')
    this.badge('firstPet')
  }

  afterRebirth() {
    this.dirty = true
    this.tutorial('rebirth')
    if (this.profile.rebirths === 1) this.badge('firstRebirth')
  }

  /** Ends the climb in progress, if any, and tells the client (it may already know). */
  finishPush(now, reason) {
    if (!this.push) return
    this.push = null
    this.busyUntil = now + 600
    this.dirty = true
    this.onPush?.(null)
    this.emit('pushEnd', { reason })
  }

  // --- Simulation ------------------------------------------------------------------

  /** Whether the player stands on (or right by) the pad for dumbbell `id`. */
  nearPadFor(id) {
    const pad = DUMBBELL_PADS[DUMBBELL_INDEX[id]]
    if (!pad) return false
    const p = this.getPosition()
    return inRect(padRect(pad), p.x, p.z, PAD_SLACK)
  }

  /** Whether the player is really sitting on the bench of the Train Zone they claim. */
  onClaimedZone() {
    if (this.zone < 0) return false
    const p = this.getPosition()
    return benchAt(p.x, p.z, SEAT_SLACK) === this.zone
  }

  /** Advances training and pushing. Call at a steady rate (the room's simulation interval). */
  tick(dt, now) {
    if (this.push) {
      if (now - this.push.lastReportAt > PUSH_TIMEOUT_MS) this.finishPush(now, 'timeout')
    } else if (this.zone >= 0 && now >= this.busyUntil && this.onClaimedZone()) {
      this.trainTimer += dt
      while (this.trainTimer >= TRAIN_INTERVAL) {
        this.trainTimer -= TRAIN_INTERVAL
        this.trainOnce(now)
      }
    } else {
      this.trainTimer = Math.min(this.trainTimer, TRAIN_INTERVAL * 0.5)
    }
    this.profile.stats.playtime += dt
    if (this.dirty) this.sendProfile()
  }

  /** Tells the client about a Muscle gain from `source` ('lift' or 'zone'). */
  gain(source, zone, result) {
    if (result.gain > 0) {
      this.emit('train', {
        source,
        zone,
        gain: result.gain,
        muscle: this.profile.muscle,
        level: this.profile.level,
        leveledUp: result.leveledUp,
        maxed: result.maxed,
      })
    }
    if (this.profile.settings.autoRebirth && !this.push && isMaxLevel(this.profile)) {
      const rebirth = applyRebirth(this.profile)
      if (rebirth.ok) this.afterRebirth()
    }
  }

  trainOnce(now) {
    const result = applyTrain(this.profile, this.zone, now)
    if (!result.ok) {
      this.zone = -1
      return
    }
    this.gain('zone', this.zone, result)
    this.tutorial('train')
  }
}
