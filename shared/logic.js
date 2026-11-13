import {
  AURAS,
  BADGES,
  BASE_GAIN,
  DAILY_INTERVAL_MS,
  DAILY_REWARDS,
  DUMBBELLS,
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
  ORBS,
  rebirthMultiplier,
  SAFE_LENGTH,
  SHOP,
  TRAIN_INTERVAL,
  TRAIN_ZONES,
  TUTORIAL,
  WIN_PAD,
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
    equippedDumbbell: 'wood',
    ownedDumbbells: ['wood'],
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
    stats: { pushes: 0, lifts: 0, bestMeter: 0, playtime: 0, bestMuscle: 0, tops: 0 },
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
  const owned = Array.isArray(raw.ownedDumbbells) ? raw.ownedDumbbells.filter((dumbbellId) => dumbbellIndex(dumbbellId) >= 0) : []
  p.ownedDumbbells = owned.length ? owned : ['wood']
  if (!p.ownedDumbbells.includes(p.equippedDumbbell)) p.equippedDumbbell = p.ownedDumbbells[0]
  if (p.equippedAura && !ownsAura(p, p.equippedAura)) p.equippedAura = null
  // A world you're not (or no longer) allowed in is World 1.
  if (!Number.isInteger(p.world) || !worldUnlocked(p, p.world)) p.world = 0
  // Levels follow from Muscle; recompute rather than trust a stored one.
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

export const dumbbellIndex = (id) => DUMBBELLS.findIndex((d) => d.id === id)
export const dumbbellById = (id) => DUMBBELLS.find((d) => d.id === id) || DUMBBELLS[0]

export function isZoneUnlocked(profile, index) {
  const zone = TRAIN_ZONES[index]
  if (!zone) return false
  if (zone.product) return Boolean(profile.passes[zone.product])
  return profile.rebirths >= zone.rebirths
}

export const ownsAura = (profile, id) => Boolean(AURAS[id] && profile.passes[AURAS[id].product])

/**
 * Muscle values are kept to a tenth below a million (the HUD shows "+1.5") and whole
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

/** Muscle into the current level and what the level takes: the bar's "25/36". */
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

/** The x2 Muscle pass and potion; they stack. */
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

/** Everything that multiplies a Muscle gain except the dumbbell and where you earn it. */
export function gainMultiplier(profile, now) {
  return rebirthMultiplier(profile.rebirths) * petMultiplier(profile) * muscleBoostMultiplier(profile, now)
}

export const dumbbellPower = (profile) => dumbbellById(profile.equippedDumbbell).power

/** Muscle from one lift with your dumbbell, standing in Train Zone `zone` (-1 = none). */
export function liftGain(profile, zone, now) {
  const zoneMult = zone >= 0 && TRAIN_ZONES[zone] ? TRAIN_ZONES[zone].mult : 1
  return tidy(BASE_GAIN * dumbbellPower(profile) * zoneMult * gainMultiplier(profile, now))
}

// --- Lifting, levels, rebirth -------------------------------------------------------

/**
 * Banks a Muscle gain and the levels it reaches. Muscle keeps growing at max level (it
 * is your pushing strength); only the level stops, at the rebirth cap.
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


/** Rebirth: +1 rebirth; Muscle and levels reset (Wins, dumbbells and pets stay). */
export function applyRebirth(profile) {
  if (!isMaxLevel(profile)) return { ok: false, error: `Reach level ${levelCap(profile.rebirths)} first!` }
  profile.rebirths += 1
  profile.tutorialStep = TUTORIAL.length
  profile.muscle = 0
  profile.level = 1
  return { ok: true, rebirths: profile.rebirths }
}

// --- The boulder tracks ------------------------------------------------------------------

/**
 * World `index`'s track: its stages bottom to top, each a slope with a flat SAFEZONE
 * above all but the last, and THE TOP at the end. Track metre m is measured along it,
 * up the slopes and across the flats alike, from the foot of the first slope.
 */
export function makeTrack(world, index) {
  const stages = world.stages
  const last = stages.length - 1
  /** Metre where each stage's slope starts: past the slopes and SAFEZONEs below it. */
  const starts = stages.map((_, i) => stages.slice(0, i).reduce((sum, stage) => sum + stage.length + SAFE_LENGTH, 0))
  const stageStart = (i) => starts[i]
  const stageTop = (i) => starts[i] + stages[i].length
  const length = stageTop(last)
  const stageAt = (meter) => {
    for (let i = 0; i < last; i += 1) if (meter < stageTop(i)) return i
    return last
  }
  const powerPerMeter = (i) => stages[i].need / stages[i].length
  const safeStart = (i) => stageTop(i - 1)
  const stagesCleared = (muscle) => {
    let n = 0
    while (n < stages.length && muscle >= stages[n].need) n += 1
    return n
  }
  // The WINS pads: one in the SAFEZONE at the top of each stage's slope, and THE TOP's
  // at the very end of the last (right across it), each paying the Wins of every stage
  // up to it - the whole climb, cashed in. Standing anywhere in [meter, end] and
  // [minX, maxX] is standing on it.
  let climbed = 0
  const winPads = stages.map((stage, i) => {
    climbed += stage.wins
    const wins = climbed
    return i < last
      ? { stage: i, meter: safeStart(i + 1) + WIN_PAD.from, end: safeStart(i + 1) + WIN_PAD.to, minX: WIN_PAD.minX, maxX: WIN_PAD.maxX, wins }
      : { stage: i, meter: length, end: Infinity, minX: -Infinity, maxX: Infinity, wins }
  })
  // The Wins orbs (see ORBS), bottom to top. `side` is -1 (left) or 1 (right); how far
  // out is the client's to say, as it goes by the size of the stage's boulder.
  const orbs = []
  stages.forEach((stage, i) => {
    const here = []
    for (let m = ORBS.from, group = 0; m + (ORBS.group - 1) * ORBS.spacing <= stage.length - ORBS.from; m += ORBS.every, group += 1) {
      for (let k = 0; k < ORBS.group; k += 1) here.push({ stage: i, meter: starts[i] + m + k * ORBS.spacing, side: (group + i) % 2 ? -1 : 1 })
    }
    const wins = Math.max(1, Math.round((stage.wins * ORBS.share) / Math.max(1, here.length)))
    for (const orb of here) orbs.push({ index: orbs.length, ...orb, wins })
  })
  return {
    index,
    world,
    stages,
    /** From the foot of the first slope to the top of the last (THE TOP). */
    length,
    /** Metres of slope below each stage's: the slopes of every stage before it. */
    slopesBelow: stages.map((_, i) => stages.slice(0, i).reduce((sum, stage) => sum + stage.length, 0)),
    stageStart,
    /** Metre at the top of stage `i`'s slope: its SAFEZONE starts there (THE TOP, for the last). */
    stageTop,
    /** Metre where the flat SAFEZONE below stage `i` (i >= 1) starts. */
    safeStart,
    /** Index of the stage metre `meter` is in. A SAFEZONE counts as the stage it leads up to. */
    stageAt,
    /** Whether metre `meter` is on a slope (not the plaza, a SAFEZONE or the summit). */
    isSlope: (meter) => meter > 0 && meter < length && meter > stageStart(stageAt(meter)),
    /** Power stage `i`'s boulder takes for every metre it's pushed up. */
    powerPerMeter,
    /** Power used pushing stage `i`'s boulder from the foot of its slope up to `meter`. */
    stageCost: (i, meter) => Math.min(stages[i].length, Math.max(0, meter - stageStart(i))) * powerPerMeter(i),
    /** How far up stage `i` `power` pushes its boulder: the top, with at least the stage's need. */
    stageReach: (i, power) => stageStart(i) + Math.min(stages[i].length, Math.max(0, power) / powerPerMeter(i)),
    /** How many stages `muscle` climbs, one after the other (power is full again for each). */
    stagesCleared,
    winPads,
    /** Every Wins orb, by index: { index, stage, meter, side, wins }. */
    orbs,
    /** The Wins orbs up each stage's slope. */
    orbsOn: stages.map((_, i) => orbs.filter((orb) => orb.stage === i)),
    /** Wins (before multipliers) of a climb with `muscle`, cashed in at the last pad it gets to. */
    runWins: (muscle) => {
      const cleared = stagesCleared(muscle)
      return cleared > 0 ? winPads[cleared - 1].wins : 0
    },
  }
}

/** Every world's track, by world index. */
export const TRACKS = WORLDS.map(makeTrack)

/** The track of the world you're in. */
export const trackOf = (profile) => TRACKS[profile.world] ?? TRACKS[0]

/** Whether you may go to world `world`: World 1 always; past it, once you've the Wins (or have been). */
export const worldUnlocked = (profile, world) =>
  world === 0 || (WORLDS[world] && (profile.badges.includes(WORLDS[world].id) || profile.wins >= WORLDS[world].wins))

/** Whether (meter, x) on a track stands on WINS pad `pad` (a little slack for lag). */
export const onWinPad = (pad, meter, x, slack = 0) =>
  meter >= pad.meter && meter <= pad.end && x >= pad.minX - slack && x <= pad.maxX + slack

/** Wins (before multipliers) of a climb with your max level's Muscle, in your world: what packs and skips cost in. */
export const maxRunWins = (profile) => trackOf(profile).runWins(muscleForLevel(levelCap(profile.rebirths)))

/**
 * The three Muscle packs as they stand for you now: `[{ amount, price }]`. Both follow
 * the Muscle your next level needs, and the Wins a climb with that much Muscle pays.
 */
export function musclePacks(profile) {
  const next = muscleForLevel(profile.level + 1)
  const wins = trackOf(profile).runWins(next)
  return MUSCLE_PACKS.map((pack) => ({
    amount: niceRound(Math.max(10, next * pack.share)),
    price: niceRound(Math.max(5, wins * pack.runs)),
  }))
}

/** Buys Muscle pack `index` with Wins. */
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

// --- Dumbbells ----------------------------------------------------------------------

export function buyDumbbell(profile, dumbbellId) {
  const dumbbell = DUMBBELLS.find((d) => d.id === dumbbellId)
  if (!dumbbell) return { ok: false, error: 'Unknown dumbbell' }
  if (profile.ownedDumbbells.includes(dumbbellId)) return equipDumbbell(profile, dumbbellId)
  const previous = DUMBBELLS[dumbbellIndex(dumbbellId) - 1]
  if (previous && !profile.ownedDumbbells.includes(previous.id)) {
    return { ok: false, error: `Buy the ${previous.name} first!` }
  }
  if (profile.wins < dumbbell.cost) return { ok: false, error: 'Not enough Wins!' }
  profile.wins -= dumbbell.cost
  profile.ownedDumbbells.push(dumbbellId)
  profile.equippedDumbbell = dumbbellId
  return { ok: true, bought: true, dumbbellId }
}

export function equipDumbbell(profile, dumbbellId) {
  if (!profile.ownedDumbbells.includes(dumbbellId)) return { ok: false, error: 'You don’t own that dumbbell' }
  profile.equippedDumbbell = dumbbellId
  return { ok: true, equipped: true, dumbbellId }
}

/** The next dumbbell in the shop you don't have yet, or null. */
export function nextDumbbell(profile) {
  return DUMBBELLS.find((d) => !profile.ownedDumbbells.includes(d.id)) || null
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

/** Muscle earned while away, if the player logged off in a Train Zone. */
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
  // The current step, or a later one done first (pushed without training, say): the
  // guide never asks for something you've already done.
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
