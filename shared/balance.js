/**
 * Every tunable number in the game. Rules live in logic.js; this file is only data,
 * so balancing never means touching code.
 *
 * Shared by client (display) and server (authority): both always agree on costs and
 * multipliers because they read the same table.
 *
 * Strength is stored as `muscle` in profiles and events (the engine's word for it);
 * everything a player reads says Strength.
 *
 * The numbers here were tuned with tools/balance-sim.mjs, which plays the game with these
 * very tables and prints when a typical player reaches each cage, body and rebirth.
 * Re-run it after changing anything below.
 */

// --- Strength and levels ----------------------------------------------------------------

/** Strength one lift (a tap) is worth before any multiplier: the "+1". */
export const BASE_GAIN = 1
/** Taps the server accepts per second (lifts and cage hits share them), and how many can be banked for a burst. */
export const MAX_LIFTS_PER_SECOND = 9
export const LIFT_BURST = 12
/** Seconds between the automatic lifts you do sitting on a Train Zone's bench. */
export const TRAIN_INTERVAL = 0.8

/**
 * Your level comes from your Strength. Level L needs LEVEL_FIRST * LEVEL_GROWTH^(L-1)
 * more Strength than the one before (15, 19, 23, 29, 36 ...), so reaching level L takes
 * muscleForLevel(L) in all.
 */
export const LEVEL_FIRST = 15
export const LEVEL_GROWTH = 1.25
export const muscleForLevel = (level) =>
  level <= 1 ? 0 : Math.round((LEVEL_FIRST * (LEVEL_GROWTH ** (level - 1) - 1)) / (LEVEL_GROWTH - 1))

// --- Rebirth ----------------------------------------------------------------------

/**
 * The level you must reach to rebirth: R0 = 5, R1 = 10, R2 = 20, R3 = 30 ... +10 a
 * rebirth up to level 100, then +5 a rebirth. Each +10 is about 9x the Strength of the
 * last step - a cage or two - so a rebirth comes round every couple of cages; past
 * level 100, where the cages are far apart, they come twice as often, so there's always
 * one to work towards.
 */
export const levelCap = (rebirths) => (rebirths <= 0 ? 5 : rebirths <= 10 ? 10 * rebirths : 100 + 5 * (rebirths - 10))

/** Strength multiplier from rebirths: R0 = x1, R1 = x1.5, R2 = x2 ... */
export const rebirthMultiplier = (rebirths) => 1 + 0.5 * Math.max(0, rebirths)

/**
 * Walking speed (m/s): a little quicker with every level you've ever reached - a rebirth
 * puts your level back to 1 but keeps the levels behind it, so you never slow down - up
 * to a top speed safely under the server's MAX_MOVE_SPEED (world.js).
 */
export function walkSpeed(level = 1, rebirths = 0) {
  let levels = Math.max(0, level - 1)
  for (let k = 0; k < rebirths && levels < 40; k += 1) levels += levelCap(k)
  return Math.min(13.5, 10 + 0.1 * levels)
}

/** Skipping straight to a rebirth costs this many runs' worth of your best WIN pad. */
export const REBIRTH_SKIP_RUNS = 8

// --- Train Zones ------------------------------------------------------------------

/**
 * The gym pads along the west side, south to north in world.js order. Sitting on one's
 * bench you lift automatically every TRAIN_INTERVAL, and every lift there (taps too) is
 * worth `mult` times more. `rebirths` = rebirths needed; `product` = the SHOP pass that
 * unlocks it instead.
 */
export const TRAIN_ZONES = [
  { id: 'starter', name: 'Starter Gym', mult: 1, rebirths: 0 },
  { id: 'iron', name: 'Iron Gym', mult: 2, rebirths: 1 },
  { id: 'pro', name: 'Pro Gym', mult: 4, rebirths: 3 },
  { id: 'gold', name: 'Golden Gym', mult: 7, rebirths: 5 },
  { id: 'lava', name: 'Lava Gym', mult: 12, rebirths: 8 },
  { id: 'frost', name: 'Frost Gym', mult: 25, product: 'zoneVeryOp', tag: 'VERY OP!' },
  { id: 'galaxy', name: 'Galaxy Gym', mult: 50, product: 'zoneBest', tag: 'BEST OVERALL!' },
]

// --- Bodies -----------------------------------------------------------------------

/**
 * Bodybuilder bodies for your avatar, bought in order with Wins: each tier multiplies
 * every lift by `power` (the old "+1" becomes "+power"), and your avatar's whole body -
 * chest, abs, back, arms and legs - grows into it, and from the Bronze Body on it's made
 * of its own metal, gem or glow (the looks are client/src/game/bodies.js).
 *
 * Priced off the WIN pads: each tier costs 3.8x the last, against pads paying 2.6x a
 * cage, so bodies come about one per cage - every new cage pays for the next body - and
 * the last of them (the TITAN BODY) near the very end. The Toned Body costs exactly what
 * the first pad pays.
 */
export const BODIES = [
  { id: 'noodle', name: 'Noodle Body', power: 1, cost: 0 },
  { id: 'toned', name: 'Toned Body', power: 2, cost: 3 },
  { id: 'pumped', name: 'Pumped Body', power: 3, cost: 11 },
  { id: 'ripped', name: 'Ripped Body', power: 5, cost: 43 },
  { id: 'bronze', name: 'Bronze Body', power: 8, cost: 160 },
  { id: 'iron', name: 'Iron Body', power: 12, cost: 630 },
  { id: 'steel', name: 'Steel Body', power: 18, cost: 2400 },
  { id: 'ruby', name: 'Ruby Body', power: 27, cost: 9000 },
  { id: 'emerald', name: 'Emerald Body', power: 40, cost: 34000 },
  { id: 'sapphire', name: 'Sapphire Body', power: 60, cost: 130000 },
  { id: 'golden', name: 'Golden Body', power: 90, cost: 500000 },
  { id: 'frost', name: 'Frost Body', power: 135, cost: 1900000 },
  { id: 'lava', name: 'Lava Body', power: 200, cost: 7200000 },
  { id: 'thunder', name: 'Thunder Body', power: 300, cost: 27000000 },
  { id: 'toxic', name: 'Toxic Body', power: 450, cost: 100000000 },
  { id: 'neon', name: 'Neon Body', power: 700, cost: 390000000 },
  { id: 'crystal', name: 'Crystal Body', power: 1000, cost: 1500000000 },
  { id: 'shadow', name: 'Shadow Body', power: 1500, cost: 5700000000 },
  { id: 'marble', name: 'Marble Body', power: 2300, cost: 22000000000 },
  { id: 'void', name: 'Void Body', power: 3500, cost: 82000000000 },
  { id: 'galaxy', name: 'Galaxy Body', power: 5200, cost: 310000000000 },
  { id: 'rainbow', name: 'Rainbow Body', power: 8000, cost: 1200000000000 },
  { id: 'celestial', name: 'Celestial Body', power: 12000, cost: 4500000000000 },
  { id: 'titan', name: 'TITAN BODY', power: 18000, cost: 17000000000000, tag: 'OP' },
]

// --- The cages --------------------------------------------------------------------

/**
 * The worlds, each a gauntlet of cages running north out of the lobby (world.js lays
 * it out): World 1, and Shadow Prison through the portal (WORLD_PORTALS), which takes
 * `wins` Wins to step into the first time.
 *
 * Each cage is a wall of bars across the gauntlet. Walk up to it and tap to break it -
 * how hard each tap hits goes with your Strength against its `need` (the
 * "Recommended"), see BREAK - and you're into the room behind it. On the left of every
 * room is its WIN pad: step on it for that cage's `wins` (times your Wins boosts) and
 * you're back in the lobby, every cage whole again. Or skip it and break the next cage
 * for a bigger pad. One pad a run: the deeper you get, the more it pays.
 *
 * Strength needs climb 6x a cage through World 1 and 3x through Shadow Prison (whose
 * last three ease to 2.5x, where there are no more bodies to buy); Wins 2.6x a cage all the
 * way. With the bodies, rebirths, gyms and pets a player picks up on the way, a typical
 * player (tools/balance-sim.mjs: 4 taps a second) breaks World 1's last cage after about
 * 2.5 hours of play and the Titan Cage after about 37 - seven weeks at 45 minutes a day -
 * with a new cage, body, rebirth, egg or pass every few minutes early on and never more
 * than a couple of hours apart until the very last cages.
 */
export const WORLDS = [
  {
    id: 'yard',
    name: 'World 1',
    cages: [
      { id: 'bamboo', name: 'Bamboo Cage', need: 10, wins: 3 },
      { id: 'brick', name: 'Brick Cage', need: 45, wins: 5 },
      { id: 'rusty', name: 'Rusty Cage', need: 270, wins: 13 },
      { id: 'steel', name: 'Steel Cage', need: 1600, wins: 34 },
      { id: 'frost', name: 'Frost Cage', need: 9700, wins: 88 },
      { id: 'jungle', name: 'Jungle Cage', need: 58000, wins: 230 },
      { id: 'candy', name: 'Candy Cage', need: 350000, wins: 590 },
      { id: 'lava', name: 'Lava Cage', need: 2100000, wins: 1500 },
      { id: 'crystal', name: 'Crystal Cage', need: 13000000, wins: 4000 },
      { id: 'toxic', name: 'Toxic Cage', need: 76000000, wins: 10000 },
      { id: 'gold', name: 'Gold Cage', need: 450000000, wins: 27000 },
      { id: 'neon', name: 'Neon Cage', need: 2700000000, wins: 71000 },
      { id: 'diamond', name: 'Diamond Cage', need: 16000000000, wins: 180000 },
      { id: 'galaxy', name: 'Galaxy Cage', need: 98000000000, wins: 480000 },
    ],
  },
  {
    id: 'shadow',
    name: 'Shadow Prison',
    wins: 1400000,
    cages: [
      { id: 'obsidian', name: 'Obsidian Cage', need: 290000000000, wins: 1200000 },
      { id: 'bone', name: 'Bone Cage', need: 880000000000, wins: 3200000 },
      { id: 'cursed', name: 'Cursed Cage', need: 2600000000000, wins: 8400000 },
      { id: 'blood', name: 'Blood Cage', need: 7900000000000, wins: 22000000 },
      { id: 'void', name: 'Void Cage', need: 24000000000000, wins: 57000000 },
      { id: 'storm', name: 'Storm Cage', need: 71000000000000, wins: 150000000 },
      { id: 'hellfire', name: 'Hellfire Cage', need: 210000000000000, wins: 380000000 },
      { id: 'celestial', name: 'Celestial Cage', need: 540000000000000, wins: 1000000000 },
      { id: 'cosmic', name: 'Cosmic Cage', need: 1300000000000000, wins: 2600000000 },
      { id: 'titan', name: 'Titan Cage', need: 3300000000000000, wins: 6700000000 },
    ],
  },
]

/**
 * Breaking a cage. Every tap at its bars fills the break bar by `hit` times your
 * Strength over the cage's need (a whole bar at most), and the bar drains by `decay` of
 * itself a second. At exactly the Recommended Strength, steady tapping breaks a cage in
 * about four seconds; at twice it, in one or two; under about a third of it, the bars
 * win however fast you tap. With `smash` times the need, the bars burst the moment you
 * walk into them - the early cages, once you're strong, cost no time at all.
 */
export const BREAK = { hit: 0.08, decay: 0.25, smash: 10 }
/** How close to the bars (metres, in front of them) you must stand to hit them. */
export const CAGE_REACH = 2.6
/** The WIN pad is walked onto from anywhere within this of its edge (client and server alike). */
export const PAD_SLACK = 0.8

// --- Pets & eggs ------------------------------------------------------------------

export const RARITIES = {
  common: { name: 'Common', color: '#b9c3cf', order: 0 },
  uncommon: { name: 'Uncommon', color: '#4ade80', order: 1 },
  rare: { name: 'Rare', color: '#38bdf8', order: 2 },
  epic: { name: 'Epic', color: '#b15cff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffc41f', order: 4 },
  mythic: { name: 'Mythic', color: '#ff3b6b', order: 5 },
  secret: { name: 'Secret', color: '#ff5bd8', order: 6 },
}

/** `mult` multiplies Strength gains. Equipped pets stack additively (see logic.js). */
export const PETS = {
  cat: { name: 'Cat', rarity: 'common', mult: 1.2 },
  dog: { name: 'Dog', rarity: 'common', mult: 1.3 },
  bunny: { name: 'Bunny', rarity: 'uncommon', mult: 1.5 },
  bear: { name: 'Bear', rarity: 'rare', mult: 2 },
  cow: { name: 'Cow', rarity: 'uncommon', mult: 2.5 },
  parrot: { name: 'Parrot', rarity: 'rare', mult: 3 },
  fox: { name: 'Fox', rarity: 'epic', mult: 4 },
  tiger: { name: 'Tiger', rarity: 'legendary', mult: 6 },
  flamingo: { name: 'Flamingo', rarity: 'uncommon', mult: 7 },
  turtle: { name: 'Turtle', rarity: 'rare', mult: 9 },
  owl: { name: 'Owl', rarity: 'epic', mult: 12 },
  phoenix: { name: 'Phoenix', rarity: 'legendary', mult: 20 },
  pony: { name: 'Pony', rarity: 'rare', mult: 16 },
  unicorn: { name: 'Unicorn', rarity: 'epic', mult: 25 },
  pegasus: { name: 'Pegasus', rarity: 'legendary', mult: 40 },
  imp: { name: 'Imp', rarity: 'rare', mult: 40 },
  bat: { name: 'Bat', rarity: 'epic', mult: 60 },
  demon: { name: 'Demon', rarity: 'legendary', mult: 100 },
  hellhound: { name: 'Hellhound', rarity: 'mythic', mult: 160 },
  dragon: { name: 'Dragon', rarity: 'epic', mult: 5 },
  crab: { name: 'Lucky Crab', rarity: 'uncommon', mult: 1.5 },
  sphinx: { name: 'Sphinx', rarity: 'secret', mult: 300 },
}

/**
 * Eggs, bought with Wins. `pets` are [petId, weight] - weights are percentages and
 * sum to 100. Each costs 5-8 runs of the pad of the cage it goes with (Basic the Brick
 * Cage, Grass the Steel, Sunset the Candy, Unicorn the Gold, Demon Shadow Prison's Bone).
 */
export const EGGS = {
  basic: { name: 'Basic', cost: { wins: 25 }, pets: [['cat', 45], ['dog', 30], ['bunny', 20], ['bear', 5]] },
  meadow: { name: 'Grass', cost: { wins: 270 }, pets: [['cow', 45], ['parrot', 30], ['fox', 20], ['tiger', 5]] },
  sunset: { name: 'Sunset', cost: { wins: 4700 }, pets: [['flamingo', 45], ['turtle', 30], ['owl', 20], ['phoenix', 5]] },
  unicorn: { name: 'Unicorn', cost: { wins: 220000 }, pets: [['pony', 50], ['unicorn', 35], ['pegasus', 15]] },
  demon: { name: 'Demon', cost: { wins: 26000000 }, pets: [['imp', 50], ['bat', 30], ['demon', 15], ['hellhound', 5]] },
}

export const MAX_EQUIPPED_PETS = 3
export const MAX_PET_INVENTORY = 60
/** Multi-hatch opens this many at once, for that many times the cost. */
export const MULTI_HATCH = 3

// --- Items, boosts, rewards -------------------------------------------------------

export const POTION_DURATION_MS = 5 * 60 * 1000

export const ITEMS = {
  potionMuscle: { name: 'x2 Strength Potion', kind: 'potion', boost: 'muscle', durationMs: POTION_DURATION_MS },
  potionWins: { name: 'x2 Wins Potion', kind: 'potion', boost: 'wins', durationMs: POTION_DURATION_MS },
  eggMeadow: { name: 'Grass Egg', kind: 'egg', egg: 'meadow' },
  eggSunset: { name: 'Sunset Egg', kind: 'egg', egg: 'sunset' },
  eggUnicorn: { name: 'Unicorn Egg', kind: 'egg', egg: 'unicorn' },
  eggDemon: { name: 'Demon Egg', kind: 'egg', egg: 'demon' },
}

/**
 * 7-day cycle; day N unlocks N x 24h after the cycle started. Something worth coming
 * back for every day, the best on day 7.
 */
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DAILY_REWARDS = [
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Dragon', icon: 'pet:dragon', sub: 'x1', grant: { pet: 'dragon' } },
  { label: 'x2 Strength', icon: 'potionMuscle', sub: '5m', grant: { item: 'potionMuscle' } },
  { label: 'Unicorn Egg', icon: 'egg:unicorn', sub: 'x1', grant: { item: 'eggUnicorn' } },
  { label: 'x2 Strength', icon: 'potionMuscle', sub: '5m', grant: { item: 'potionMuscle' } },
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Demon Egg', icon: 'egg:demon', sub: 'x1', grant: { item: 'eggDemon' } },
]

/** Claimable once each per session, after this many minutes played: a reason to stay one more round. */
export const PLAYTIME_REWARDS = [
  { minutes: 3, label: '+25 Wins', icon: 'trophy', grant: { wins: 25 } },
  { minutes: 8, label: 'x2 Strength', icon: 'potionMuscle', grant: { item: 'potionMuscle' } },
  { minutes: 15, label: 'Grass Egg', icon: 'egg:meadow', grant: { item: 'eggMeadow' } },
  { minutes: 25, label: 'x2 Wins', icon: 'potionWins', grant: { item: 'potionWins' } },
  { minutes: 40, label: '+1K Wins', icon: 'trophy', grant: { wins: 1000 } },
  { minutes: 60, label: 'Sunset Egg', icon: 'egg:sunset', grant: { item: 'eggSunset' } },
]

/** The stand by spawn: a pet the first time, a potion on later sessions. */
export const FREE_REWARD = { firstTime: { pet: 'crab' }, repeat: { item: 'potionMuscle' } }

/** Offline training: a quarter of your Train Zone's rate, for up to 8 hours away. */
export const OFFLINE_RATE = 0.25
export const OFFLINE_MAX_MS = 8 * 60 * 60 * 1000
export const OFFLINE_MIN_MS = 60 * 1000

/**
 * The world portals (placed by PORTALS in world.js): the world each takes you to (and
 * back from), its name, and the Wins needed to step through the first time. Stepping
 * through earns the badge of the same id.
 */
export const WORLD_PORTALS = {
  shadow: { world: 1, name: WORLDS[1].name, wins: WORLDS[1].wins },
}

// --- Auras ------------------------------------------------------------------------

/**
 * Auras: a glow round your character that multiplies the Wins you earn. Bought from the
 * SHOP (`product`); the one you bought last is worn.
 */
export const AURAS = {
  lightning: { name: 'Lightning Aura', wins: 1.25, color: '#7fe0ff', product: 'auraLightning' },
  galaxy: { name: 'Galaxy Aura', wins: 1.5, color: '#b66bff', product: 'auraGalaxy' },
  water: { name: 'Water Aura', wins: 2, color: '#2fb4ff', product: 'auraWater' },
  fire: { name: 'Fire Aura', wins: 3, color: '#ff6a1e', product: 'auraFire' },
  rainbow: { name: 'Rainbow Aura', wins: 5, color: '#ff7ad9', product: 'auraRainbow' },
}

// --- Shop -------------------------------------------------------------------------

/**
 * The shop. Wins are the game's only currency: everything here, like bodies and eggs, is
 * bought with them. `pass` = permanent unlock; `consumable` = grants every time.
 * Priced like the bodies: 15-25 runs of the pad of the cage each belongs to (x2 Strength
 * the Frost Cage's, x2 Wins the Candy's ... the Rainbow Aura the Cosmic's).
 */
export const SHOP = {
  muscleX2: { name: 'x2 Strength', price: 1300, kind: 'pass' },
  winsX2: { name: 'x2 Wins', price: 8800, kind: 'pass' },
  muscleX3: { name: 'x3 Strength', price: 3600000, kind: 'pass' },
  winsX3: { name: 'x3 Wins', price: 24000000, kind: 'pass' },
  vip: { name: 'VIP', price: 3800000000, kind: 'pass' },
  zoneVeryOp: { name: 'VERY OP! Gym', price: 200000, kind: 'pass' },
  zoneBest: { name: 'BEST OVERALL! Gym', price: 550000000, kind: 'pass' },
  auraLightning: { name: 'Lightning Aura', price: 3400, kind: 'pass', aura: 'lightning' },
  auraGalaxy: { name: 'Galaxy Aura', price: 540000, kind: 'pass', aura: 'galaxy' },
  auraWater: { name: 'Water Aura', price: 170000000, kind: 'pass', aura: 'water' },
  auraFire: { name: 'Fire Aura', price: 9500000000, kind: 'pass', aura: 'fire' },
  auraRainbow: { name: 'Rainbow Aura', price: 65000000000, kind: 'pass', aura: 'rainbow' },
  potionsMuscle: { name: '3 Strength Potions', price: 350, kind: 'consumable', grant: { item: 'potionMuscle', amount: 3 } },
  potionsWins: { name: '3 Wins Potions', price: 920, kind: 'consumable', grant: { item: 'potionWins', amount: 3 } },
  eggsSunset: { name: '3 Sunset Eggs', price: 9000, kind: 'consumable', grant: { item: 'eggSunset', amount: 3 } },
  eggsUnicorn: { name: '3 Unicorn Eggs', price: 430000, kind: 'consumable', grant: { item: 'eggUnicorn', amount: 3 } },
  eggsDemon: { name: '3 Demon Eggs', price: 50000000, kind: 'consumable', grant: { item: 'eggDemon', amount: 3 } },
  sphinx: { name: 'Sphinx', price: 270000000000, kind: 'consumable', grant: { pet: 'sphinx' }, stock: 1000 },
}

/** Sphinx stock shown before the server reports the live count. */
export const SPHINX_STOCK_DEFAULT = 954

/**
 * The three Strength packs under the level bar. They grow with you: each gives `share`
 * of the Strength your next level needs, for `runs` runs' worth of your best WIN pad.
 */
export const MUSCLE_PACKS = [
  { share: 1, runs: 0.6 },
  { share: 6, runs: 3 },
  { share: 25, runs: 10 },
]

// --- Tutorial & badges ------------------------------------------------------------

/**
 * The guide for brand-new players - all of it: train on a bench in the FREE gym until
 * strong enough for the first cage, break it, take its Wins on the WIN pad (which
 * brings you back to the lobby), and spend them on your first new body. After that, no more
 * guides. Each step completes when its event fires (with at least `muscle` Strength,
 * where given: what the first cage needs).
 */
export const TUTORIAL = [
  { text: 'Sit on a bench in the FREE gym to train!', event: 'train', target: 'zone0', muscle: 10 },
  { text: 'Tap the cage bars to break them!', event: 'break', target: 'cage' },
  { text: 'Step on the WIN pad for Wins!', event: 'cashIn', target: 'pad' },
  { text: 'Buy the Toned Body with your Wins!', event: 'buyBody', target: 'bodies' },
]

/**
 * The game's Boxity leaderboards, shown on its Boxity page and behind the trophy button
 * in the game. Ids and settings are permanent once Boxity has seen them (later changes
 * are made in the Boxity dashboard). The client declares them; the server reports the
 * scores, from its own state.
 */
export const BOXITY_BOARDS = [
  { id: 'strength', label: 'Strongest', order: 'desc', mode: 'best', format: 'compact', reset: 'none' },
  { id: 'rebirths', label: 'Most Rebirths', order: 'desc', mode: 'best', format: 'number', reset: 'weekly' },
  { id: 'wins', label: 'Most Wins', order: 'desc', mode: 'sum', format: 'compact', reset: 'weekly' },
]

export const BADGES = {
  firstBreak: { name: 'Jailbreak' },
  firstRebirth: { name: 'First Rebirth' },
  firstPet: { name: 'Pet Owner' },
  halfway: { name: 'Halfway Out' },
  escaped: { name: 'Escaped!' },
  shadow: { name: 'Into the Shadows' },
}
