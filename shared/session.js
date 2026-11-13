import {
  CAGE_REACH,
  EGGS,
  ITEMS,
  LIFT_BURST,
  MAX_LIFTS_PER_SECOND,
  MULTI_HATCH,
  PAD_SLACK,
  SHOP,
  TRAIN_INTERVAL,
  TRAIN_ZONES,
  WORLD_PORTALS,
} from './balance.js'
import {
  advanceTutorial,
  applyLift,
  applyRebirth,
  applyTrain,
  awardBadge,
  breakProgress,
  buyBody,
  buyMusclePack,
  buyShopItem,
  cagesBefore,
  cagesIn,
  canSmash,
  claimDaily,
  claimFreeReward,
  claimPlaytime,
  createSession,
  deletePet,
  equipBody,
  equipAura,
  equipBestPets,
  equipPet,
  hatchEgg,
  isMaxLevel,
  isZoneUnlocked,
  padWins,
  skipRebirth,
  unequipPet,
  usePotion,
  worldUnlocked,
} from './logic.js'
import { atCage, benchAt, CAGE_RETURN, eggStandNear, FREE_REWARD, inRect, portalAt, winPadRect } from './world.js'

/** A seated player's reported position may wander this far off the bench (lag). */
const SEAT_SLACK = 0.5
/** How far outside a cage's reach a hit still counts (lag). */
const HIT_SLACK = 1.5
/**
 * How far from where we last saw them a player may say they stepped onto a WIN pad: a
 * position report or two (they're sent ten times a second) at full speed.
 */
const PAD_CLAIM_REACH = 4
/** After a WIN pad, how long the trip home may skip the speed and cage checks. */
const RETURN_MS = 5000
/** Cages counted towards the Halfway Out badge. */
const HALFWAY = 7

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
 * - 'train'      { source, zone, gain, muscle, level, leveledUp, maxed }  each Strength
 *                  gain; `source` is 'lift' (a tap) or 'zone' (training in Train Zone
 *                  `zone`). Walking earns nothing.
 * - 'cageHit'    { cage, progress }  a tap at cage `cage`'s bars: its break bar now (0-1)
 * - 'cageBroken' { cage }  cage `cage` is broken: its room is open to you this run
 * - 'padReward'  { pad, wins, last }  Wins for room `pad`'s WIN pad; the run's over and
 *                  you're on your way home (`last`: the world's last pad)
 * - 'pack'       { amount }  a Strength pack landed
 * - 'hatch'      { eggId, pets: [{ uid, id }] }  pets to reveal
 * - 'badge'      { id, name }
 * - 'world'      { world }  through a portal
 *
 * A run: break the cages in order, as far as you can, and cash in at the WIN pad of a
 * room you got into. Cages you've broken stand open for you until you cash in, change
 * worlds or respawn; `onReturn(point)` tells the host you're being put back in the
 * lobby at `point`.
 */
export class PlayerSession {
  /**
   * @param {object} profile normalized profile (see logic.normalizeProfile)
   * @param {{ now: number, emit: (type: string, payload?: object) => void,
   *           getPosition: () => {x: number, y: number, z: number},
   *           onPurchase?: (productId: string) => boolean,
   *           onReturn?: (point: {x: number, z: number}) => void }} options
   *   `onPurchase` lets the host veto or count a shop sale (stock limits).
   */
  constructor(profile, { now, emit, getPosition, onPurchase, onReturn }) {
    this.profile = profile
    this.session = createSession(now)
    this.emit = emit
    this.getPosition = getPosition
    this.onPurchase = onPurchase
    this.onReturn = onReturn

    /** Train Zone the client says it's in; verified against position every tick. */
    this.zone = -1
    this.trainTimer = 0
    /**
     * The run: the world it's in, how many of its cages are broken (in order: the next
     * to break is cage `broken`), and the break bar of the cage being hit - its index,
     * how full, and when it was last hit.
     */
    this.run = { world: profile.world, broken: 0, cage: -1, progress: 0, at: 0 }
    /** Server time until which the trip home from a WIN pad skips the host's position checks. */
    this.returnUntil = 0
    /** Wins earned on WIN pads not yet counted towards a leaderboard. */
    this.winsEarned = 0
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

  /** The run, started afresh if you've changed worlds since it began. */
  syncRun() {
    if (this.run.world !== this.profile.world) this.resetRun()
    return this.run
  }

  /** Every cage whole again: back to the start of a run in the world you're in. */
  resetRun() {
    this.run = { world: this.profile.world, broken: 0, cage: -1, progress: 0, at: 0 }
  }

  /** Spends a tap from the bucket shared by lifts and cage hits; false when tapping faster than a human can. */
  takeTap(now) {
    this.liftTokens = Math.min(LIFT_BURST, this.liftTokens + ((now - this.liftRefilledAt) / 1000) * MAX_LIFTS_PER_SECOND)
    this.liftRefilledAt = now
    if (this.liftTokens < 1) return false
    this.liftTokens -= 1
    return true
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

    /** One tap: a lift with your body, worth more in a Train Zone. */
    lift(_payload, now) {
      if (!this.takeTap(now)) return
      const zone = this.onClaimedZone() ? this.zone : -1
      this.gain('lift', zone, applyLift(this.profile, zone, now))
      this.tutorial('lift')
    },

    setting({ key, value }) {
      if (key !== 'autoRebirth') return
      this.profile.settings.autoRebirth = Boolean(value)
      this.dirty = true
    },

    rebirth() {
      const result = applyRebirth(this.profile)
      if (result.ok) this.afterRebirth()
    },

    skipRebirth() {
      const result = skipRebirth(this.profile)
      if (result.ok) this.afterRebirth()
    },

    /**
     * One tap at the bars of the next cage, standing in front of them: it fills the break
     * bar by how strong you are for that cage, less what's drained since the last tap.
     * Full - or strong enough to smash straight through - and it breaks.
     */
    hit(_payload, now) {
      if (!this.takeTap(now)) return
      const run = this.syncRun()
      const i = run.broken
      const cage = cagesIn(run.world)[i]
      if (!cage) return
      const p = this.getPosition()
      if (!atCage(i, p.x, p.z, CAGE_REACH, HIT_SLACK)) return
      const muscle = this.profile.muscle
      const progress = breakProgress(run.cage === i ? run.progress : 0, (now - run.at) / 1000, muscle, cage.need)
      run.cage = i
      run.at = now
      if (progress >= 1 || canSmash(muscle, cage.need)) {
        this.breakCage(i)
        return
      }
      run.progress = progress
      this.emit('cageHit', { cage: i, progress })
    },

    /**
     * Stepped onto room `pad`'s WIN pad at (x, z): a room you've broken into this run,
     * the spot really on the pad and no further from where you were last seen than a
     * step or two. Pays the pad, ends the run and sends you home.
     */
    claimPad({ pad, x, z }, now) {
      const run = this.syncRun()
      const i = Number(pad)
      if (!Number.isInteger(i) || i < 0 || i >= run.broken) return
      const px = Number(x)
      const pz = Number(z)
      if (!Number.isFinite(px) || !Number.isFinite(pz)) return
      const seen = this.getPosition()
      if (Math.hypot(px - seen.x, pz - seen.z) > PAD_CLAIM_REACH) return
      if (!inRect(winPadRect(i), px, pz, PAD_SLACK)) return
      const wins = padWins(this.profile, i, now)
      const last = i === cagesIn(run.world).length - 1
      this.profile.wins += wins
      this.winsEarned += wins
      this.profile.stats.runs += 1
      if (last) {
        this.profile.stats.escapes += 1
        this.badge('escaped')
      }
      this.resetRun()
      this.returnUntil = now + RETURN_MS
      this.dirty = true
      this.emit('padReward', { pad: i, wins, last })
      this.onReturn?.(CAGE_RETURN)
      this.tutorial('cashIn')
    },

    /** Buys (or, owned, puts on) body `id`: from the Bodies panel anywhere, or the body shop's pads. */
    buyBody({ id }) {
      const result = buyBody(this.profile, id)
      if (!result.ok) return
      this.dirty = true
      if (result.bought) this.tutorial('buyBody')
    },

    equipBody({ id }) {
      const result = equipBody(this.profile, id)
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
     * from that world, back to World 1. A new world is a new run.
     */
    portal() {
      const p = this.getPosition()
      const portal = portalAt(p.x, p.z, 2)
      if (!portal) return
      const there = WORLD_PORTALS[portal.id].world
      const to = this.profile.world === there ? 0 : there
      if (!worldUnlocked(this.profile, to)) return
      if (to === there) this.badge(portal.id)
      this.profile.world = to
      this.resetRun()
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

  /** Cage `i` broken: its room is open for the rest of the run. */
  breakCage(i) {
    const run = this.run
    run.broken = i + 1
    run.cage = -1
    run.progress = 0
    const stats = this.profile.stats
    stats.breaks += 1
    const number = cagesBefore(run.world) + run.broken
    if (number > stats.bestCage) stats.bestCage = number
    this.dirty = true
    this.emit('cageBroken', { cage: i })
    this.tutorial('break')
    this.badge('firstBreak')
    if (number >= HALFWAY) this.badge('halfway')
  }

  // --- Simulation ------------------------------------------------------------------

  /** Whether the player is really sitting on the bench of the Train Zone they claim. */
  onClaimedZone() {
    if (this.zone < 0) return false
    const p = this.getPosition()
    return benchAt(p.x, p.z, SEAT_SLACK) === this.zone
  }

  /** Advances training. Call at a steady rate (the room's simulation interval). */
  tick(dt, now) {
    if (this.zone >= 0 && this.onClaimedZone()) {
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

  /** Tells the client about a Strength gain from `source` ('lift' or 'zone'). */
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
    if (this.profile.settings.autoRebirth && isMaxLevel(this.profile)) {
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
