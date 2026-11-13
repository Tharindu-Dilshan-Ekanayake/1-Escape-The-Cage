import {
  BODIES,
  AURAS,
  BADGES,
  BASE_GAIN,
  BREAK,
  DAILY_INTERVAL_MS,
  DAILY_REWARDS,
  EGGS,
  FREE_REWARD,
  ITEMS,
  levelCap,
  MAX_EQUIPPED_PETS,
  MAX_PET_INVENTORY,
  muscleForLevel,
  MUSCLE_PACKS,
  OFFLINE_MAX_MS,
  OFFLINE_MIN_MS,
  OFFLINE_RATE,
  PETS,
  PLAYTIME_REWARDS,
  RARITIES,
  REBIRTH_SKIP_RUNS,
  rebirthMultiplier,
  SHOP,
  TRAIN_INTERVAL,
  TRAIN_ZONES,
  TUTORIAL,
  WORLDS,
} from './balance.js'

/**
 * Game rules as pure functions over a plain profile object.
 *
 * The server runs these authoritatively; the client runs the very same functions for
 * offline play and for display (costs, multipliers, what a button would do). Mutating
 * functions change the profile in place and return a small result describing what
 * happened, which is what gets sent to the client as an event.
 *
 * `session` is the per-connection state that is never saved: when this session
 * started, which playtime rewards were claimed, the free-reward flag.
 */

export const PROFILE_VERSION = 1

export function createProfile(id, name) {
  return {
    v: PROFILE_VERSION,
    id,
    name,
    muscle: 0,
    wins: 0,
    rebirths: 0,
    level: 1,
    equippedBody: 'noodle',
    ownedBodies: ['noodle'],
    equippedAura: null,
    pets: [],
    equippedPets: [],
    nextPetUid: 1,
    items: {},
    boosts: { muscle: 0, wins: 0 },
    passes: {},
    daily: { start: 0, claimed: [] },
    freeRewardClaimed: false,
    tutorialStep: 0,
    badges: [],
    /** The world you're in: an index into WORLDS. */
    world: 0,
    /**
     * `runs`: WIN pads cashed in; `breaks`: cages broken; `bestCage`: the most cages
     * ever broken in one run, counted through the worlds (World 1's, then Shadow
     * Prison's); `escapes`: runs cashed in at a world's last pad.
     */
    stats: { runs: 0, lifts: 0, breaks: 0, bestCage: 0, playtime: 0, bestMuscle: 0, escapes: 0 },
    lastZone: -1,
    lastSeen: 0,
    settings: { autoRebirth: false },
  }
}

/** Fills in anything missing from an older or partial save. Never throws. */
export function normalizeProfile(raw, id, name) {
  const base = createProfile(id, name)
  if (!raw || typeof raw !== 'object') return base
  const p = { ...base, ...raw, id, name: name || raw.name || base.name }
  p.boosts = { ...base.boosts, ...(raw.boosts || {}) }
  p.stats = { ...base.stats, ...(raw.stats || {}) }
  p.settings = { ...base.settings, ...(raw.settings || {}) }
  p.daily = { ...base.daily, ...(raw.daily || {}) }
  p.items = Object.fromEntries(Object.entries(raw.items || {}).filter(([itemId]) => ITEMS[itemId]))
  p.passes = { ...(raw.passes || {}) }
  p.muscle = Number.isFinite(raw.muscle) ? Math.max(0, raw.muscle) : 0
  p.wins = Number.isFinite(raw.wins) ? Math.max(0, raw.wins) : 0
  p.pets = Array.isArray(raw.pets) ? raw.pets.filter((pet) => PETS[pet?.id]) : []
  p.equippedPets = Array.isArray(raw.equippedPets)
    ? raw.equippedPets.filter((uid) => p.pets.some((pet) => pet.uid === uid)).slice(0, MAX_EQUIPPED_PETS)
    : []
  const owned = Array.isArray(raw.ownedBodies) ? raw.ownedBodies.filter((bodyId) => bodyIndex(bodyId) >= 0) : []
  p.ownedBodies = owned.length ? owned : ['noodle']
  if (!p.ownedBodies.includes(p.equippedBody)) p.equippedBody = p.ownedBodies[0]
  if (p.equippedAura && !ownsAura(p, p.equippedAura)) p.equippedAura = null
  // A world you're not (or no longer) allowed in is World 1.
  if (!Number.isInteger(p.world) || !worldUnlocked(p, p.world)) p.world = 0
  // Levels follow from Strength; recompute rather than trust a stored one.
  p.level = levelFor(p.muscle, p.rebirths)
  // The tutorial is for brand-new players only: anyone who has rebirthed is past it.
  if (p.rebirths > 0) p.tutorialStep = TUTORIAL.length
  p.v = PROFILE_VERSION
  return p
}

export function createSession(now) {
  return { start: now, playtimeClaimed: [], freeRewardTaken: false }
}

// --- Lookups ------------------------------------------------------------------------

export const bodyIndex = (id) => BODIES.findIndex((b) => b.id === id)
export const bodyById = (id) => BODIES.find((b) => b.id === id) || BODIES[0]

export function isZoneUnlocked(profile, index) {
  const zone = TRAIN_ZONES[index]
  if (!zone) return false
  if (zone.product) return Boolean(profile.passes[zone.product])
  return profile.rebirths >= zone.rebirths
}

export const ownsAura = (profile, id) => Boolean(AURAS[id] && profile.passes[AURAS[id].product])

/**
 * Strength values are kept to a tenth below a million (the HUD shows "+1.5") and whole
 * above, so repeated small gains don't pile up float dust.
 */
export const tidy = (value) => (value < 1e6 ? Math.round(value * 10) / 10 : Math.round(value))

/** "Nice" price or amount: two significant figures (692 -> 690, 1934 -> 1900). */
export function niceRound(n) {
  if (n < 100) return Math.max(1, Math.round(n))
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

// --- Levels -------------------------------------------------------------------------

/** The level `muscle` reaches, never above the cap for `rebirths`. */
export function levelFor(muscle, rebirths) {
  const cap = levelCap(rebirths)
  let level = 1
  while (level < cap && muscle >= muscleForLevel(level + 1)) level += 1
  return level
}

export const isMaxLevel = (profile) => profile.level >= levelCap(profile.rebirths)

/** Strength into the current level and what the level takes: the bar's "25/36". */
export function levelXp(profile) {
  const from = muscleForLevel(profile.level)
  const to = muscleForLevel(profile.level + 1)
  return { have: Math.max(0, profile.muscle - from), need: to - from }
}

/** 0..1 through the current level: what the level bar fills to. */
export function levelProgress(profile) {
  if (isMaxLevel(profile)) return 1
  const { have, need } = levelXp(profile)
  return Math.max(0, Math.min(1, have / Math.max(1e-9, need)))
}

/** 0..1 progress towards being able to rebirth, by levels. */
export function rebirthProgress(profile) {
  const cap = levelCap(profile.rebirths)
  if (profile.level >= cap) return 1
  return Math.max(0, Math.min(1, (profile.level - 1 + levelProgress(profile)) / Math.max(1, cap - 1)))
}

// --- Multipliers --------------------------------------------------------------------

/** Equipped pets stack additively: x3 and x2 together make x4, not x6. */
export function petMultiplier(profile) {
  let total = 1
  for (const uid of profile.equippedPets) {
    const pet = profile.pets.find((p) => p.uid === uid)
    if (pet && PETS[pet.id]) total += PETS[pet.id].mult - 1
  }
  return total
}

export const isBoostActive = (profile, kind, now) => (profile.boosts[kind] || 0) > now

/** The x2 Strength pass and potion; they stack. */
export function muscleBoostMultiplier(profile, now) {
  const passes = profile.passes
  return (passes.muscleX2 ? 2 : 1) * (passes.muscleX3 ? 3 : 1) * (passes.vip ? 1.5 : 1) * (isBoostActive(profile, 'muscle', now) ? 2 : 1)
}

/** The aura you wear multiplies your Wins. */
export const auraMultiplier = (profile) => AURAS[profile.equippedAura]?.wins ?? 1

/** The x2 and x3 Wins passes, VIP, the Wins potion and your aura; they all stack. */
export function winsMultiplier(profile, now) {
  const passes = profile.passes
  return (passes.winsX2 ? 2 : 1) * (passes.winsX3 ? 3 : 1) * (passes.vip ? 1.5 : 1) * (isBoostActive(profile, 'wins', now) ? 2 : 1) * auraMultiplier(profile)
}

/** Everything that multiplies a Strength gain except your body and where you earn it. */
export function gainMultiplier(profile, now) {
  return rebirthMultiplier(profile.rebirths) * petMultiplier(profile) * muscleBoostMultiplier(profile, now)
}

export const bodyPower = (profile) => bodyById(profile.equippedBody).power

/** Strength from one lift with your body, sitting in Train Zone `zone` (-1 = none). */
export function liftGain(profile, zone, now) {
  const zoneMult = zone >= 0 && TRAIN_ZONES[zone] ? TRAIN_ZONES[zone].mult : 1
  return tidy(BASE_GAIN * bodyPower(profile) * zoneMult * gainMultiplier(profile, now))
}

// --- Lifting, levels, rebirth -------------------------------------------------------

/**
 * Banks a Strength gain and the levels it reaches. Strength keeps growing at max level
 * (it's what breaks cages); only the level stops, at the rebirth cap.
 */
function addMuscle(profile, gain) {
  const cap = levelCap(profile.rebirths)
  const added = tidy(Math.max(0, gain))
  profile.muscle = tidy(profile.muscle + added)
  profile.stats.bestMuscle = Math.max(profile.stats.bestMuscle, profile.muscle)
  const before = profile.level
  profile.level = levelFor(profile.muscle, profile.rebirths)
  return { gain: added, leveledUp: profile.level > before, maxed: profile.level >= cap }
}

/** One lift (a click), in Train Zone `zone` or -1. */
export function applyLift(profile, zone, now) {
  profile.stats.lifts += 1
  return { ok: true, ...addMuscle(profile, liftGain(profile, zone, now)) }
}

/** One automatic lift standing in Train Zone `index`. */
export function applyTrain(profile, index, now) {
  if (!isZoneUnlocked(profile, index)) return { ok: false, error: 'Train Zone locked' }
  profile.lastZone = index
  return { ok: true, ...addMuscle(profile, liftGain(profile, index, now)) }
}


/** Rebirth: +1 rebirth; Strength and levels reset (Wins, bodies and pets stay). */
export function applyRebirth(profile) {
  if (!isMaxLevel(profile)) return { ok: false, error: `Reach level ${levelCap(profile.rebirths)} first!` }
  profile.rebirths += 1
  profile.tutorialStep = TUTORIAL.length
  profile.muscle = 0
  profile.level = 1
  return { ok: true, rebirths: profile.rebirths }
}

// --- The cages -------------------------------------------------------------------------

/** The cages of world `world` (an index into WORLDS), first to last. */
export const cagesIn = (world) => (WORLDS[world] ?? WORLDS[0]).cages

/** The cages of the world you're in. */
export const cagesOf = (profile) => cagesIn(profile.world)

/** Cages in the worlds before world `world`: what its cage numbers start after. */
export const cagesBefore = (world) => WORLDS.slice(0, world).reduce((sum, w) => sum + w.cages.length, 0)

/** Whether you may go to world `world`: World 1 always; past it, once you've the Wins (or have been). */
export const worldUnlocked = (profile, world) =>
  world === 0 || Boolean(WORLDS[world] && (profile.badges.includes(WORLDS[world].id) || profile.wins >= WORLDS[world].wins))

/** How much of the break bar one tap fills, with `muscle` Strength at a cage that needs `need`. */
export const hitPower = (muscle, need) => Math.min(1, (BREAK.hit * Math.max(0, muscle)) / Math.max(1, need))

/** Whether `muscle` Strength bursts through bars that need `need` just by walking into them. */
export const canSmash = (muscle, need) => muscle >= need * BREAK.smash

/**
 * The break bar after a tap: what it was, drained for the `seconds` since the last tap,
 * plus this tap's hit. 1 or more and the cage breaks.
 */
export const breakProgress = (progress, seconds, muscle, need) =>
  Math.max(0, progress - BREAK.decay * Math.max(0, seconds)) + hitPower(muscle, need)

/**
 * Seconds of tapping at `taps` a second to break a cage that needs `need` with `muscle`
 * Strength: 0 when you smash straight through (or one tap does it), Infinity when the
 * bars drain faster than you can fill them.
 */
export function breakTime(muscle, need, taps = 6) {
  if (canSmash(muscle, need)) return 0
  const hit = hitPower(muscle, need)
  if (hit >= 1) return 0
  const perTap = hit - BREAK.decay / taps
  if (perTap <= 0) return Infinity
  return Math.ceil((1 - hit) / perTap) / taps
}

/** Whether `muscle` Strength can break a `need` cage at all, tapping flat out. */
export const canBreak = (muscle, need, taps = 9) => breakTime(muscle, need, taps) < Infinity

/**
 * How many of world `world`'s cages `muscle` Strength gets through one after another,
 * counting only cages it meets the Recommended Strength of.
 */
export function cagesCleared(world, muscle) {
  const cages = cagesIn(world)
  let n = 0
  while (n < cages.length && muscle >= cages[n].need) n += 1
  return n
}

/** Wins (before multipliers) of the deepest WIN pad `muscle` Strength comfortably reaches in world `world`. */
export function runWins(world, muscle) {
  const n = cagesCleared(world, muscle)
  return n > 0 ? cagesIn(world)[n - 1].wins : 0
}

/** What WIN pad `cage` (an index into your world's cages) pays you now, boosts and all. */
export const padWins = (profile, cage, now) =>
  Math.max(1, Math.round((cagesOf(profile)[cage]?.wins ?? 0) * winsMultiplier(profile, now)))

/** Wins (before multipliers) of a run with your max level's Strength, in your world: what packs and skips cost in. */
export const maxRunWins = (profile) =>
  Math.max(cagesOf(profile)[0].wins, runWins(profile.world, muscleForLevel(levelCap(profile.rebirths))))

/**
 * The three Strength packs as they stand for you now: `[{ amount, price }]`. Both follow
 * the Strength your next level needs, and the Wins a run with that much Strength pays.
 */
export function musclePacks(profile) {
  const next = muscleForLevel(profile.level + 1)
  const wins = Math.max(cagesOf(profile)[0].wins, runWins(profile.world, next))
  return MUSCLE_PACKS.map((pack) => ({
    amount: niceRound(Math.max(10, next * pack.share)),
    price: niceRound(Math.max(5, wins * pack.runs)),
  }))
}

/** Buys Strength pack `index` with Wins. */
export function buyMusclePack(profile, index) {
  const pack = musclePacks(profile)[index]
  if (!pack) return { ok: false, error: 'Unknown pack' }
  if (profile.wins < pack.price) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= pack.price
  addMuscle(profile, pack.amount)
  return { ok: true, amount: pack.amount }
}

/** Wins to rebirth now without reaching max level first. */
export const rebirthSkipPrice = (profile) => niceRound(Math.max(50, maxRunWins(profile) * REBIRTH_SKIP_RUNS))

export function skipRebirth(profile) {
  if (isMaxLevel(profile)) return applyRebirth(profile)
  const price = rebirthSkipPrice(profile)
  if (profile.wins < price) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= price
  profile.level = levelCap(profile.rebirths)
  return applyRebirth(profile)
}

// --- Bodies ------------------------------------------------------------------------

/** Buys body `bodyId` (the next one you don't have) and puts it on. An owned one is just put on. */
export function buyBody(profile, bodyId) {
  const body = BODIES.find((b) => b.id === bodyId)
  if (!body) return { ok: false, error: 'Unknown body' }
  if (profile.ownedBodies.includes(bodyId)) return equipBody(profile, bodyId)
  const previous = BODIES[bodyIndex(bodyId) - 1]
  if (previous && !profile.ownedBodies.includes(previous.id)) {
    return { ok: false, error: `Buy the ${previous.name} first!` }
  }
  if (profile.wins < body.cost) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= body.cost
  profile.ownedBodies.push(bodyId)
  profile.equippedBody = bodyId
  return { ok: true, bought: true, bodyId }
}

export function equipBody(profile, bodyId) {
  if (!profile.ownedBodies.includes(bodyId)) return { ok: false, error: 'You don’t own that body' }
  profile.equippedBody = bodyId
  return { ok: true, equipped: true, bodyId }
}

/** The next body in the shop you don't have yet, or null. */
export function nextBody(profile) {
  return BODIES.find((b) => !profile.ownedBodies.includes(b.id)) || null
}

// --- Auras --------------------------------------------------------------------------

/** Wears aura `id` (one you own), or none with null. */
export function equipAura(profile, id) {
  if (id !== null && !ownsAura(profile, id)) return { ok: false, error: 'You don’t own that aura' }
  profile.equippedAura = id
  return { ok: true }
}

// --- Pets --------------------------------------------------------------------------

function rollPet(eggId, rand) {
  const egg = EGGS[eggId]
  const total = egg.pets.reduce((sum, [, w]) => sum + w, 0)
  let r = rand() * total
  for (const [petId, weight] of egg.pets) {
    r -= weight
    if (r < 0) return petId
  }
  return egg.pets[egg.pets.length - 1][0]
}

export function addPet(profile, petId) {
  const pet = { uid: profile.nextPetUid++, id: petId }
  profile.pets.push(pet)
  // Auto-equip into a free slot, so a first pet does something straight away.
  if (profile.equippedPets.length < MAX_EQUIPPED_PETS) profile.equippedPets.push(pet.uid)
  return pet
}

/**
 * Hatches `count` eggs. `paid` says how: 'wins' charges the egg's Wins price, 'item'
 * consumes an egg item, 'free' is for reward grants already paid for.
 */
export function hatchEgg(profile, eggId, count = 1, { paid = 'wins', rand = Math.random } = {}) {
  const egg = EGGS[eggId]
  if (!egg) return { ok: false, error: 'Unknown egg' }
  if (profile.pets.length + count > MAX_PET_INVENTORY) return { ok: false, error: 'Pet inventory full!' }
  if (paid === 'wins') {
    if (!egg.cost.wins) return { ok: false, error: 'This egg is premium only' }
    const price = egg.cost.wins * count
    if (profile.wins < price) return { ok: false, error: 'Not enough Wins!' }
    profile.wins -= price
  } else if (paid === 'item') {
    const itemId = Object.keys(ITEMS).find((k) => ITEMS[k].kind === 'egg' && ITEMS[k].egg === eggId)
    if (!itemId || (profile.items[itemId] || 0) < count) return { ok: false, error: 'No eggs left' }
    profile.items[itemId] -= count
  }
  const pets = []
  for (let i = 0; i < count; i += 1) pets.push(addPet(profile, rollPet(eggId, rand)))
  return { ok: true, eggId, pets }
}

export function equipPet(profile, uid) {
  if (!profile.pets.some((p) => p.uid === uid)) return { ok: false, error: 'Unknown pet' }
  if (profile.equippedPets.includes(uid)) return { ok: true }
  if (profile.equippedPets.length >= MAX_EQUIPPED_PETS) return { ok: false, error: `Max ${MAX_EQUIPPED_PETS} pets equipped` }
  profile.equippedPets.push(uid)
  return { ok: true }
}

export function unequipPet(profile, uid) {
  profile.equippedPets = profile.equippedPets.filter((u) => u !== uid)
  return { ok: true }
}

const petScore = (pet) => PETS[pet.id]?.mult ?? 0

export function equipBestPets(profile) {
  const best = [...profile.pets].sort((a, b) => petScore(b) - petScore(a)).slice(0, MAX_EQUIPPED_PETS)
  profile.equippedPets = best.map((p) => p.uid)
  return { ok: true }
}

export function deletePet(profile, uid) {
  const before = profile.pets.length
  profile.pets = profile.pets.filter((p) => p.uid !== uid)
  profile.equippedPets = profile.equippedPets.filter((u) => u !== uid)
  return { ok: profile.pets.length < before }
}

/** Sort key for inventory display: equipped first, then rarity, then multiplier. */
export function petSortKey(profile, pet) {
  const info = PETS[pet.id]
  const equipped = profile.equippedPets.includes(pet.uid) ? 1 : 0
  return equipped * 1e6 + (RARITIES[info.rarity]?.order ?? 0) * 1e4 + info.mult
}

// --- Items & boosts ---------------------------------------------------------------

export function addItem(profile, itemId, amount = 1) {
  profile.items[itemId] = (profile.items[itemId] || 0) + amount
}

export function usePotion(profile, itemId, now) {
  const item = ITEMS[itemId]
  if (!item || item.kind !== 'potion') return { ok: false, error: 'Not a potion' }
  if ((profile.items[itemId] || 0) <= 0) return { ok: false, error: 'None left' }
  profile.items[itemId] -= 1
  // Stacks: a second potion extends the timer instead of wasting it.
  profile.boosts[item.boost] = Math.max(profile.boosts[item.boost] || 0, now) + item.durationMs
  return { ok: true, boost: item.boost, endsAt: profile.boosts[item.boost] }
}

/** Applies a reward grant: { wins } | { muscle } | { item } | { pet } | { hatch }. */
export function applyGrant(profile, grant, { rand = Math.random } = {}) {
  const result = { ok: true }
  if (grant.wins) profile.wins += grant.wins
  if (grant.muscle) addMuscle(profile, grant.muscle)
  if (grant.item) addItem(profile, grant.item, grant.amount || 1)
  if (grant.pet) result.pets = [addPet(profile, grant.pet)]
  if (grant.hatch) {
    const hatched = hatchEgg(profile, grant.hatch, 1, { paid: 'free', rand })
    if (!hatched.ok) return hatched
    result.pets = hatched.pets
    result.eggId = grant.hatch
  }
  return result
}

// --- Daily & playtime rewards -------------------------------------------------------

/**
 * State of each daily reward: 'claimed' | 'ready' | 'next' (with `unlocksIn` ms) |
 * 'locked'. A new 7-day cycle starts on first claim after the last one finishes.
 */
export function dailyStatus(profile, now) {
  const { start, claimed } = profile.daily
  const fresh = !start || claimed.length >= DAILY_REWARDS.length
  const cycleStart = fresh ? now : start
  let nextShown = false
  return DAILY_REWARDS.map((reward, day) => {
    if (!fresh && claimed.includes(day)) return { day, state: 'claimed' }
    const unlockAt = cycleStart + day * DAILY_INTERVAL_MS
    if (now >= unlockAt) return { day, state: 'ready' }
    if (!nextShown) {
      nextShown = true
      return { day, state: 'next', unlocksIn: unlockAt - now }
    }
    return { day, state: 'locked' }
  })
}

export function claimDaily(profile, day, now, opts) {
  const status = dailyStatus(profile, now)[day]
  if (!status || status.state !== 'ready') return { ok: false, error: 'Not ready yet' }
  if (!profile.daily.start || profile.daily.claimed.length >= DAILY_REWARDS.length) {
    profile.daily = { start: now, claimed: [] }
  }
  profile.daily.claimed.push(day)
  const result = applyGrant(profile, DAILY_REWARDS[day].grant, opts)
  return { ...result, day, label: DAILY_REWARDS[day].label }
}

export function playtimeStatus(session, now) {
  const minutes = (now - session.start) / 60000
  return PLAYTIME_REWARDS.map((reward, index) => {
    if (session.playtimeClaimed.includes(index)) return { index, state: 'claimed' }
    if (minutes >= reward.minutes) return { index, state: 'ready' }
    return { index, state: 'locked', unlocksIn: (reward.minutes - minutes) * 60000 }
  })
}

export function claimPlaytime(profile, session, index, now, opts) {
  const status = playtimeStatus(session, now)[index]
  if (!status || status.state !== 'ready') return { ok: false, error: 'Not ready yet' }
  session.playtimeClaimed.push(index)
  const result = applyGrant(profile, PLAYTIME_REWARDS[index].grant, opts)
  return { ...result, index, label: PLAYTIME_REWARDS[index].label }
}

export function claimFreeReward(profile, session, opts) {
  if (session.freeRewardTaken) return { ok: false, error: 'Already claimed this session' }
  session.freeRewardTaken = true
  const grant = profile.freeRewardClaimed ? FREE_REWARD.repeat : FREE_REWARD.firstTime
  profile.freeRewardClaimed = true
  return { ...applyGrant(profile, grant, opts), grant }
}

// --- Shop ---------------------------------------------------------------------------

/** Buys a SHOP item with Wins. An aura is worn as soon as it's bought. */
export function buyShopItem(profile, productId, opts = {}) {
  const item = SHOP[productId]
  if (!item) return { ok: false, error: 'Unknown item' }
  if (item.kind === 'pass' && profile.passes[productId]) return { ok: false, error: 'Already owned' }
  if (profile.wins < item.price) return { ok: false, error: 'Not enough Wins!' }
  if (item.kind === 'pass') {
    profile.wins -= item.price
    profile.passes[productId] = true
    if (item.aura) profile.equippedAura = item.aura
    return { ok: true, productId, pass: true }
  }
  const result = applyGrant(profile, item.grant || {}, opts)
  if (result.ok) profile.wins -= item.price
  return { ...result, productId }
}

// --- Offline progress -------------------------------------------------------------

/** Strength earned while away, if the player logged off in a Train Zone. */
export function applyOfflineProgress(profile, now) {
  const away = Math.min(OFFLINE_MAX_MS, now - (profile.lastSeen || now))
  if (profile.lastZone < 0 || away < OFFLINE_MIN_MS) return null
  if (!isZoneUnlocked(profile, profile.lastZone)) return null
  const steps = Math.floor(away / 1000 / TRAIN_INTERVAL)
  // Potions don't run while you're away.
  const gain = liftGain(profile, profile.lastZone, 0)
  const result = addMuscle(profile, Math.floor(steps * gain * OFFLINE_RATE))
  if (result.gain <= 0) return null
  return { muscle: result.gain, ms: away }
}

// --- Tutorial & badges ------------------------------------------------------------

/** Advances the tutorial if `event` completes the current step. */
export function advanceTutorial(profile, event) {
  // The current step, or a later one done first (broke a cage without training on a
  // bench, say): the guide never asks for something you've already done.
  for (let i = profile.tutorialStep; i < TUTORIAL.length; i += 1) {
    const step = TUTORIAL[i]
    if (step.event === event && profile.muscle >= (step.muscle || 0)) {
      profile.tutorialStep = i + 1
      return true
    }
  }
  return false
}

/** Awards a badge once. Returns the badge if newly awarded. */
export function awardBadge(profile, id) {
  if (!BADGES[id] || profile.badges.includes(id)) return null
  profile.badges.push(id)
  return { id, ...BADGES[id] }
}
