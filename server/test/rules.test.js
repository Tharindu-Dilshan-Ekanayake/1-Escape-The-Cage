import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BODIES,
  AURAS,
  BREAK,
  CAGE_REACH,
  EGGS,
  levelCap,
  MAX_LIFTS_PER_SECOND,
  muscleForLevel,
  rebirthMultiplier,
  SHOP,
  TUTORIAL,
  walkSpeed,
  WORLD_PORTALS,
  WORLDS,
} from '../../shared/balance.js'
import { formatNumber } from '../../shared/format.js'
import {
  applyLift,
  applyRebirth,
  applyTrain,
  breakTime,
  buyBody,
  buyMusclePack,
  buyShopItem,
  canBreak,
  canSmash,
  createProfile,
  dailyStatus,
  hatchEgg,
  levelFor,
  levelXp,
  musclePacks,
  normalizeProfile,
  padWins,
  runWins,
  skipRebirth,
  winsMultiplier,
} from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import {
  BODY_PADS,
  atCage,
  BENCH_HALF,
  BENCH_X,
  CAGE_RETURN,
  cageWallZ,
  GAUNTLET,
  gauntletLimitZ,
  MAX_CAGES,
  PORTALS,
  roomAt,
  roomCenterZ,
  winPadRect,
  ZONE_X,
  zoneCenterZ,
} from '../../shared/world.js'

/** Sat on Train Zone `i`'s middle bench. */
const onBench = (i) => ({ x: BENCH_X, y: 0.4, z: zoneCenterZ(i) })
/** Standing at cage `i`'s bars, in front of them (south), within reach. */
const atBars = (i) => ({ x: 0, y: 0, z: cageWallZ(i) + GAUNTLET.wallHalf + 1 })
/** The middle of room `i`'s WIN pad. */
const onPad = (i) => {
  const r = winPadRect(i)
  return { x: (r.minX + r.maxX) / 2, y: 0, z: (r.minZ + r.maxZ) / 2 }
}

/** A session for `profile` with its events collected, standing at `pos`. */
function sessionAt(pos, profile = createProfile('a', 'A')) {
  const events = []
  const returns = []
  const s = new PlayerSession(profile, {
    now: 0,
    emit: (type, payload) => events.push({ type, payload }),
    getPosition: () => pos,
    onReturn: (point) => returns.push(point),
  })
  return { s, events, returns, p: profile, of: (type) => events.filter((e) => e.type === type) }
}

/** Taps at the bars of the cage the run's at until it breaks (or `max` taps), 6 a second from `t0`. */
function breakNext(s, t0 = 0, max = 200) {
  const before = s.run.broken
  let t = t0
  for (let i = 0; i < max && s.run.broken === before; i += 1) {
    t += 1000 / 6
    s.handle('hit', {}, t)
  }
  return t
}

test('numbers format like the HUD', () => {
  assert.deepEqual(
    [0, 999, 1000, 1234, 7300, 14000, 2.5e6, 9999, 3.3e15].map(formatNumber),
    ['0', '999', '1K', '1.2K', '7.3K', '14K', '2.5M', '9.9K', '3.3Qa'],
  )
})

test('levels need 15, 19, 23, 29, 36... Strength each', () => {
  assert.deepEqual([2, 3, 4, 5].map(muscleForLevel), [15, 34, 57, 86])
  const p = createProfile('a', 'A')
  p.muscle = muscleForLevel(4) + 25
  p.level = levelFor(p.muscle, 0)
  assert.equal(p.level, 4)
  assert.deepEqual(levelXp(p), { have: 25, need: muscleForLevel(5) - muscleForLevel(4) })
})

test('rebirth is at level 5, then 10, 20 ... 100, then +5 a rebirth, with +0.5x per rebirth', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 10, 11, 12].map(levelCap), [5, 10, 20, 30, 40, 100, 105, 110])
  assert.deepEqual([0, 1, 2, 3].map(rebirthMultiplier), [1, 1.5, 2, 2.5])
  assert.equal(levelFor(1e9, 0), 5, 'never past the cap')
})

test('Strength keeps growing at max level; only the level stops', () => {
  const p = createProfile('a', 'A')
  for (let i = 0; i < 1000; i += 1) applyLift(p, -1, 0)
  assert.equal(p.muscle, 1000)
  assert.equal(p.level, levelCap(0))
})

test('bodies, Train Zones and rebirths multiply lifts', () => {
  const p = createProfile('a', 'A')
  applyLift(p, -1, 0)
  assert.equal(p.muscle, 1)
  p.ownedBodies.push('toned', 'pumped')
  p.equippedBody = 'pumped'
  applyLift(p, -1, 0)
  assert.equal(p.muscle, 1 + 3)
  p.rebirths = 1
  applyTrain(p, 1, 0)
  assert.equal(p.muscle, 1 + 3 + 3 * 2 * 1.5)
})

test('locked Train Zones give nothing', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyTrain(p, 1, 0).ok, false)
  assert.equal(p.muscle, 0)
})

test('rebirth needs max level, resets Strength, keeps Wins and bodies', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyRebirth(p).ok, false)
  p.ownedBodies.push('toned')
  for (let i = 0; i < 400; i += 1) applyLift(p, -1, 0)
  p.wins = 50
  assert.equal(applyRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.equal(p.muscle, 0)
  assert.equal(p.level, 1)
  assert.equal(p.wins, 50)
  assert.deepEqual(p.ownedBodies, ['noodle', 'toned'])
})

test('skipping to a rebirth costs Wins', () => {
  const p = createProfile('a', 'A')
  assert.equal(skipRebirth(p).ok, false)
  p.wins = 1e9
  assert.equal(skipRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.ok(p.wins < 1e9)
})

// --- The cages ----------------------------------------------------------------------

test('every cage needs more Strength and pays more Wins than the one before, through both worlds', () => {
  const cages = WORLDS.flatMap((w) => w.cages)
  assert.equal(WORLDS[0].cages.length, 14)
  assert.equal(WORLDS[1].cages.length, 10)
  assert.equal(MAX_CAGES, 14)
  cages.forEach((cage, i) => {
    if (i === 0) return
    assert.ok(cage.need > cages[i - 1].need, `${cage.id} needs more`)
    assert.ok(cage.wins > cages[i - 1].wins, `${cage.id} pays more`)
  })
  assert.equal(new Set(cages.map((c) => c.id)).size, cages.length, 'every cage its own id (its look is keyed by it)')
  // Shadow Prison opens for about three of World 1's last pads.
  assert.ok(WORLDS[1].wins <= WORLDS[0].cages.at(-1).wins * 4)
})

test('breaking: a few seconds at the Recommended Strength, never when far too weak, at once when far stronger', () => {
  const need = 1000
  const atNeed = breakTime(need, need, 6)
  assert.ok(atNeed >= 2 && atNeed <= 6, `${atNeed} s at the Recommended Strength`)
  assert.ok(breakTime(need * 2, need, 6) < atNeed)
  assert.equal(breakTime(need * 0.3, need, MAX_LIFTS_PER_SECOND), Infinity, 'under a third: the bars win')
  assert.equal(canBreak(need * 0.3, need), false)
  assert.equal(canBreak(need * 0.5, need), true, 'half the need: possible, tapping flat out')
  assert.equal(breakTime(need * BREAK.smash, need, 6), 0)
  assert.equal(canSmash(need * BREAK.smash, need), true)
})

test('the gauntlet: cages one after another north of the plaza, a WIN pad on the left of each room', () => {
  assert.equal(cageWallZ(0), GAUNTLET.startZ)
  for (let i = 0; i < MAX_CAGES; i += 1) {
    const pad = winPadRect(i)
    // Inside its room, on the left (west) as you walk in.
    assert.equal(roomAt(onPad(i).x, onPad(i).z, MAX_CAGES), i)
    assert.ok(pad.maxX < 0 && pad.minX > -GAUNTLET.halfWidth)
    assert.ok(pad.maxZ < cageWallZ(i) && pad.minZ > cageWallZ(i + 1))
    assert.ok(roomCenterZ(i) < cageWallZ(i))
    // In front of a cage's bars you can hit it; behind them, not.
    assert.equal(atCage(i, 0, cageWallZ(i) + 1.5, CAGE_REACH), true)
    assert.equal(atCage(i, 0, cageWallZ(i) - 2, CAGE_REACH), false)
  }
  assert.equal(roomAt(0, 0, MAX_CAGES), -1, 'spawn is in the plaza')
  // With no cage broken you may not be past the first; with one, not past the second.
  assert.ok(gauntletLimitZ(0, 14) > cageWallZ(1))
  assert.ok(gauntletLimitZ(1, 14) < cageWallZ(0))
  assert.ok(CAGE_RETURN.z > GAUNTLET.startZ, 'home is in the plaza')
})

test('a cage breaks only from in front of its bars, one at a time, in order', () => {
  const pos = { x: 0, y: 0, z: 0 }
  const p = createProfile('a', 'A')
  p.muscle = WORLDS[0].cages[1].need
  const { s, of } = sessionAt(pos, p)
  s.handle('hit', {}, 100)
  assert.equal(of('cageHit').length, 0, 'not from spawn')
  Object.assign(pos, atBars(1))
  s.handle('hit', {}, 200)
  assert.equal(of('cageHit').length + of('cageBroken').length, 0, 'not the second cage before the first')
  Object.assign(pos, atBars(0))
  breakNext(s, 300)
  assert.equal(s.run.broken, 1)
  assert.deepEqual(of('cageBroken').map((e) => e.payload.cage), [0])
  assert.equal(p.stats.bestCage, 1)
  Object.assign(pos, atBars(1))
  breakNext(s, 5000)
  assert.equal(s.run.broken, 2)
  assert.equal(p.badges.includes('firstBreak'), true)
})

test('the break bar fills with each tap and drains between them', () => {
  const pos = atBars(0)
  const p = createProfile('a', 'A')
  p.muscle = WORLDS[0].cages[0].need
  const { s, of } = sessionAt(pos, p)
  s.handle('hit', {}, 1000)
  s.handle('hit', {}, 1100)
  const [a, b] = of('cageHit').map((e) => e.payload.progress)
  assert.ok(b > a, 'a quick second tap adds')
  s.handle('hit', {}, 5000)
  const c = of('cageHit').at(-1).payload.progress
  assert.ok(c < b, 'four seconds of rest drained it')
  assert.equal(s.run.broken, 0)
})

test('strong enough, one tap - or walking into it - smashes a cage', () => {
  const p = createProfile('a', 'A')
  p.muscle = WORLDS[0].cages[0].need * BREAK.smash
  const { s, of } = sessionAt(atBars(0), p)
  s.handle('hit', {}, 1000)
  assert.equal(of('cageBroken').length, 1)
  assert.equal(of('cageHit').length, 0)
})

test('taps are shared by lifts and hits, at a human rate', () => {
  const p = createProfile('a', 'A')
  p.muscle = 1
  const { s, of } = sessionAt(atBars(0), p)
  // A big burst in the same instant: only the banked taps count.
  for (let i = 0; i < 100; i += 1) s.handle('hit', {}, 1000)
  for (let i = 0; i < 100; i += 1) s.handle('lift', {}, 1000)
  assert.ok(of('cageHit').length + of('train').length <= 12)
})

test('a WIN pad pays only in a room you broke into, pays its cage with your boosts, and sends you home', () => {
  const pos = atBars(0)
  const p = createProfile('a', 'A')
  p.muscle = WORLDS[0].cages[0].need * BREAK.smash
  const { s, of, returns } = sessionAt(pos, p)
  const pad = onPad(0)
  Object.assign(pos, pad)
  s.handle('claimPad', { pad: 0, x: pad.x, z: pad.z }, 100)
  assert.equal(p.wins, 0, 'cage 0 still whole')
  Object.assign(pos, atBars(0))
  s.handle('hit', {}, 200)
  assert.equal(s.run.broken, 1)
  // Claimed from a spot far from where we last saw you: no.
  s.handle('claimPad', { pad: 0, x: pad.x, z: pad.z }, 300)
  assert.equal(p.wins, 0, 'not from across the room')
  Object.assign(pos, pad)
  // Room 1's pad: not broken into.
  s.handle('claimPad', { pad: 1, x: onPad(1).x, z: onPad(1).z }, 400)
  assert.equal(p.wins, 0)
  p.passes.winsX2 = true
  s.handle('claimPad', { pad: 0, x: pad.x, z: pad.z }, 500)
  assert.equal(p.wins, WORLDS[0].cages[0].wins * 2)
  assert.equal(s.winsEarned, p.wins)
  assert.deepEqual(of('padReward')[0].payload, { pad: 0, wins: p.wins, last: false })
  assert.deepEqual(returns, [CAGE_RETURN])
  assert.equal(s.run.broken, 0, 'every cage whole again')
  assert.ok(s.returnUntil > 500)
  // And only once.
  s.handle('claimPad', { pad: 0, x: pad.x, z: pad.z }, 600)
  assert.equal(of('padReward').length, 1)
})

test('deeper pads pay more: skip a pad, break the next cage, cash in there', () => {
  const p = createProfile('a', 'A')
  p.muscle = WORLDS[0].cages[2].need * BREAK.smash
  const pos = atBars(0)
  const { s } = sessionAt(pos, p)
  for (let i = 0; i < 3; i += 1) {
    Object.assign(pos, atBars(i))
    s.handle('hit', {}, 1000 + i * 1000)
  }
  assert.equal(s.run.broken, 3)
  Object.assign(pos, onPad(2))
  s.handle('claimPad', { pad: 2, x: pos.x, z: pos.z }, 9000)
  assert.equal(p.wins, padWins(p, 2, 9000))
  assert.equal(p.wins, WORLDS[0].cages[2].wins)
})

test('the first pad pays for the first new body, as the guide asks', () => {
  assert.ok(runWins(0, TUTORIAL[0].muscle) >= BODIES[1].cost)
  assert.ok(WORLDS[0].cages[0].need <= TUTORIAL[0].muscle)
  assert.deepEqual(
    TUTORIAL.map((step) => step.event),
    ['train', 'break', 'cashIn', 'buyBody'],
    'train, break the first cage, take its Wins, buy a body - and that is all',
  )
})

test('the guide: train on a bench, break the first cage, cash in, buy a body, done', () => {
  const p = createProfile('a', 'A')
  const pos = onBench(0)
  const { s } = sessionAt(pos, p)
  s.handle('enterZone', { zone: 0 }, 0)
  for (let t = 0; s.profile.muscle < TUTORIAL[0].muscle && t < 200; t += 1) s.tick(1, t * 1000)
  assert.equal(p.tutorialStep, 1, 'trained enough for the first cage')
  s.handle('leaveZone', {}, 0)
  Object.assign(pos, atBars(0))
  breakNext(s, 300000)
  assert.equal(p.tutorialStep, 2, 'broke it')
  Object.assign(pos, onPad(0))
  s.handle('claimPad', { pad: 0, x: pos.x, z: pos.z }, 320000)
  assert.equal(p.tutorialStep, 3, 'took the Wins on the WIN pad')
  s.handle('buyBody', { id: BODIES[1].id }, 330000)
  assert.equal(p.tutorialStep, TUTORIAL.length, 'and the guide is over')
})

test('changing worlds starts a new run, in that world\'s cages', () => {
  const pos = atBars(0)
  const p = createProfile('a', 'A')
  p.muscle = WORLDS[1].cages[0].need * BREAK.smash
  const { s, of } = sessionAt(pos, p)
  s.handle('hit', {}, 100)
  assert.equal(s.run.broken, 1)
  // Through the portal (been before: no Wins needed).
  p.badges.push(WORLDS[1].id)
  const portal = PORTALS[0]
  Object.assign(pos, { x: portal.x, z: portal.z })
  s.handle('portal', {}, 200)
  assert.equal(p.world, 1)
  assert.equal(s.run.broken, 0)
  Object.assign(pos, atBars(0))
  s.handle('hit', {}, 300)
  assert.equal(s.run.world, 1)
  Object.assign(pos, onPad(0))
  s.handle('claimPad', { pad: 0, x: pos.x, z: pos.z }, 400)
  assert.equal(of('padReward')[0].payload.wins, WORLDS[1].cages[0].wins)
})

// --- Bodies -------------------------------------------------------------------------

test('bodies are bought in order with Wins, anywhere, and put on at once', () => {
  const p = createProfile('a', 'A')
  p.wins = 1000
  assert.equal(buyBody(p, BODIES[3].id).ok, false, 'not before the ones under them')
  const { s } = sessionAt({ x: 0, y: 0, z: 0 }, p)
  s.handle('buyBody', { id: BODIES[1].id }, 0)
  assert.equal(p.wins, 1000 - BODIES[1].cost)
  assert.equal(p.equippedBody, BODIES[1].id)
  s.handle('equipBody', { id: 'noodle' }, 0)
  assert.equal(p.equippedBody, 'noodle')
  s.handle('equipBody', { id: BODIES[5].id }, 0)
  assert.equal(p.equippedBody, 'noodle', 'not ones you never bought')
})

test('every body is stronger and dearer than the last, and has a stand in the shop', () => {
  assert.equal(BODIES.length, 24)
  assert.equal(BODY_PADS.length, BODIES.length)
  BODIES.forEach((body, i) => {
    if (i === 0) return
    assert.ok(body.power > BODIES[i - 1].power, body.id)
    assert.ok(body.cost > BODIES[i - 1].cost, body.id)
  })
})

test('Strength packs scale with your level', () => {
  const p = createProfile('a', 'A')
  const early = musclePacks(p)
  assert.equal(early.length, 3)
  p.muscle = 300
  p.level = levelFor(p.muscle, 0)
  const later = musclePacks(p)
  assert.ok(later[0].amount > early[0].amount)
  p.wins = later[2].price
  assert.equal(buyMusclePack(p, 2).ok, true)
  assert.equal(p.muscle, 300 + later[2].amount)
  assert.equal(p.wins, 0)
})

test('egg odds add up to 100% and hatching charges wins', () => {
  for (const [id, egg] of Object.entries(EGGS)) {
    assert.equal(egg.pets.reduce((s, [, w]) => s + w, 0), 100, id)
  }
  const p = createProfile('a', 'A')
  p.wins = EGGS.basic.cost.wins
  const r = hatchEgg(p, 'basic', 1, { rand: () => 0 })
  assert.equal(r.ok, true)
  assert.equal(p.wins, 0)
  assert.equal(p.pets[0].id, 'cat')
  assert.deepEqual(p.equippedPets, [p.pets[0].uid])
})

test('daily rewards unlock one per day', () => {
  const p = createProfile('a', 'A')
  const states = dailyStatus(p, 0).map((d) => d.state)
  assert.deepEqual(states.slice(0, 3), ['ready', 'next', 'locked'])
})

test('corrupt or old saves load safely', () => {
  const p = normalizeProfile({ pets: [{ uid: 1, id: 'nope' }], equippedPets: [1], ownedBodies: ['nope'], muscle: 'x', equippedAura: 'water' }, 'x', 'X')
  assert.deepEqual(p.pets, [])
  assert.deepEqual(p.equippedPets, [])
  assert.deepEqual(p.ownedBodies, ['noodle'])
  assert.equal(p.equippedBody, 'noodle')
  assert.equal(p.muscle, 0)
  assert.equal(p.equippedAura, null, 'an aura you never bought')
})

test('the session only trains sitting on a bench where the player really is', () => {
  const pos = { x: 0, y: 0, z: 0 }
  const { s } = sessionAt(pos)
  s.handle('enterZone', { zone: 0 }, 0)
  s.tick(2, 0)
  assert.equal(s.profile.muscle, 0, 'claimed a Train Zone from spawn')
  Object.assign(pos, { x: ZONE_X + 2.6, y: 0.4, z: zoneCenterZ(0) + 2.4 })
  s.tick(2, 0)
  assert.equal(s.profile.muscle, 0, 'on the pad but not on a bench')
  Object.assign(pos, onBench(0))
  s.tick(2, 0)
  assert.ok(s.profile.muscle > 0)
  let before = s.profile.muscle
  Object.assign(pos, { ...onBench(0), z: zoneCenterZ(0) + BENCH_HALF - 0.4 })
  s.tick(2, 0)
  assert.ok(s.profile.muscle > before, 'near the end of the bench')
  Object.assign(pos, onBench(1))
  before = s.profile.muscle
  s.tick(2, 0)
  assert.equal(s.profile.muscle, before)
})

test('lifts are limited to a human clicking rate', () => {
  const { s, p } = sessionAt({ x: 0, y: 0, z: 0 })
  for (let i = 0; i < 200; i += 1) s.handle('lift', {}, 1000)
  assert.ok(p.muscle <= 12, `got ${p.muscle}`)
  for (let i = 0; i < 200; i += 1) s.handle('lift', {}, 2000)
  assert.ok(p.muscle <= 22, `got ${p.muscle}`)
  assert.equal(p.tutorialStep, 0, 'tapping is not the guide\'s training on a bench')
})

test('lifts in a Train Zone are multiplied by it', () => {
  const pos = onBench(1)
  const p = createProfile('a', 'A')
  p.rebirths = 1
  const { s } = sessionAt(pos, p)
  s.handle('enterZone', { zone: 1 }, 0)
  s.handle('lift', {}, 0)
  assert.equal(p.muscle, 1 * 2 * 1.5)
})

test('the Shadow Prison portal badges you only from its swirl, with its Wins', () => {
  const pos = { x: 0, y: 0, z: 0 }
  const { s } = sessionAt(pos)
  const portal = PORTALS[0]
  s.profile.wins = WORLD_PORTALS[portal.id].wins - 1
  s.handle('portal', {}, 0)
  assert.deepEqual(s.profile.badges, [], 'not from spawn')
  Object.assign(pos, { x: portal.x, z: portal.z })
  s.handle('portal', {}, 0)
  assert.deepEqual(s.profile.badges, [], 'one Win short')
  s.profile.wins += 1
  s.handle('portal', {}, 0)
  assert.deepEqual(s.profile.badges, [portal.id])
  assert.equal(s.profile.world, 1, 'into Shadow Prison')
  s.handle('portal', {}, 0)
  assert.equal(s.profile.world, 0)
  s.profile.wins = 0
  s.handle('portal', {}, 0)
  assert.equal(s.profile.world, 1)
})

test('walking speed grows with every level ever reached, and never drops on rebirth', () => {
  assert.equal(walkSpeed(1, 0), 10)
  assert.ok(walkSpeed(5, 0) > walkSpeed(1, 0))
  assert.ok(walkSpeed(1, 1) >= walkSpeed(5, 0), 'a rebirth keeps you as quick')
  assert.ok(walkSpeed(30, 5) <= 13.5)
})

test('walking earns no Strength: only lifting does', () => {
  const pos = { x: 0, y: 0, z: 10 }
  const { s, p } = sessionAt(pos)
  s.tick(0.1, 0)
  for (let i = 1; i <= 50; i += 1) {
    pos.x += 0.82
    s.tick(0.1, i * 100)
  }
  assert.equal(p.muscle, 0)
})

test('only brand-new players get the tutorial', () => {
  const fresh = normalizeProfile({ rebirths: 0, tutorialStep: 1 }, 'a', 'A')
  assert.equal(fresh.tutorialStep, 1)
  const reborn = normalizeProfile({ rebirths: 1, tutorialStep: 1 }, 'b', 'B')
  assert.equal(reborn.tutorialStep, TUTORIAL.length)
})

test('the shop sells for Wins only', () => {
  const p = createProfile('a', 'A')
  const { s } = sessionAt({ x: 0, z: 0 }, p)
  s.handle('purchase', { productId: 'muscleX2' }, 0)
  assert.equal(p.passes.muscleX2, undefined)
  p.wins = SHOP.muscleX2.price + 7
  s.handle('purchase', { productId: 'muscleX2' }, 0)
  assert.equal(p.passes.muscleX2, true)
  assert.equal(p.wins, 7)
  applyLift(p, -1, 0)
  assert.equal(p.muscle, 2, 'x2 Strength doubles gains')
})

test('the store: x3 and VIP passes stack, and bundles give three of a thing', () => {
  const p = createProfile('a', 'A')
  p.wins = SHOP.winsX3.price + SHOP.vip.price + SHOP.potionsMuscle.price + SHOP.eggsUnicorn.price
  assert.equal(winsMultiplier(p, 0), 1)
  assert.equal(buyShopItem(p, 'winsX3').ok, true)
  assert.equal(buyShopItem(p, 'vip').ok, true)
  assert.equal(winsMultiplier(p, 0), 4.5)
  assert.equal(buyShopItem(p, 'potionsMuscle').ok, true)
  assert.equal(p.items.potionMuscle, 3)
  assert.equal(buyShopItem(p, 'eggsUnicorn').ok, true)
  assert.equal(p.items.eggUnicorn, 3)
  assert.equal(buyShopItem(p, 'vip').ok, false, 'a pass is bought once')
})

test('auras are worn when bought and multiply Wins', () => {
  const p = createProfile('a', 'A')
  const { s } = sessionAt({ x: 0, z: 0 }, p)
  p.wins = SHOP.auraLightning.price
  s.handle('purchase', { productId: 'auraLightning' }, 0)
  assert.equal(p.equippedAura, 'lightning')
  assert.equal(winsMultiplier(p, 0), AURAS.lightning.wins)
  s.handle('equipAura', { id: null }, 0)
  assert.equal(winsMultiplier(p, 0), 1)
  s.handle('equipAura', { id: 'water' }, 0)
  assert.equal(p.equippedAura, null, 'not one you never bought')
})
