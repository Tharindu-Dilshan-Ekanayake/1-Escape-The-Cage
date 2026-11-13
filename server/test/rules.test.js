import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AURAS,
  DUMBBELLS,
  EGGS,
  levelCap,
  muscleForLevel,
  ORBS,
  PUSH_START,
  rebirthMultiplier,
  SAFE_LENGTH,
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
  buyDumbbell,
  buyMusclePack,
  buyShopItem,
  createProfile,
  dailyStatus,
  hatchEgg,
  levelFor,
  levelXp,
  musclePacks,
  normalizeProfile,
  skipRebirth,
  TRACKS,
  winsMultiplier,
} from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { BENCH_HALF, BENCH_X, DUMBBELL_PADS, isPushReturn, PORTALS, PUSH_RETURN, PUSH_ZONE, SPAWN, ZONE_X, zoneCenterZ } from '../../shared/world.js'

/** World 1's track, which most of these tests climb. */
const {
  stages: STAGES,
  length: TRACK_LENGTH,
  winPads: WIN_PADS,
  isSlope,
  powerPerMeter,
  runWins,
  safeStart,
  stageAt,
  stageCost,
  stageReach,
  stageStart,
  stageTop,
} = TRACKS[0]

/** Sat on Train Zone `i`'s middle bench. */
const onBench = (i) => ({ x: BENCH_X, y: 0.4, z: zoneCenterZ(i) })
const inPushZone = () => ({ x: 0, y: 0, z: (PUSH_ZONE.minZ + PUSH_ZONE.maxZ) / 2 })

/** A session for `profile` with its events collected, standing at `pos`. */
function sessionAt(pos, profile = createProfile('a', 'A')) {
  const events = []
  const s = new PlayerSession(profile, { now: 0, emit: (type, payload) => events.push({ type, payload }), getPosition: () => pos })
  return { s, events, p: profile, of: (type) => events.filter((e) => e.type === type) }
}

test('numbers format like the HUD', () => {
  assert.deepEqual(
    [0, 999, 1000, 1234, 7300, 14000, 2.5e6, 9999].map(formatNumber),
    ['0', '999', '1K', '1.2K', '7.3K', '14K', '2.5M', '9.9K'],
  )
})

test('levels need 15, 19, 23, 29, 36... Muscle each, as in the reference', () => {
  assert.deepEqual([2, 3, 4, 5].map(muscleForLevel), [15, 34, 57, 86])
  const p = createProfile('a', 'A')
  p.muscle = muscleForLevel(4) + 25
  p.level = levelFor(p.muscle, 0)
  assert.equal(p.level, 4)
  assert.deepEqual(levelXp(p), { have: 25, need: muscleForLevel(5) - muscleForLevel(4) })
})

test('rebirth is at level 5, then 10, 20, 30, with +0.5x per rebirth', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(levelCap), [5, 10, 20, 30, 40])
  assert.deepEqual([0, 1, 2, 3].map(rebirthMultiplier), [1, 1.5, 2, 2.5])
  assert.equal(levelFor(1e9, 0), 5, 'never past the cap')
})

test('Muscle keeps growing at max level; only the level stops', () => {
  const p = createProfile('a', 'A')
  for (let i = 0; i < 1000; i += 1) applyLift(p, -1, 0)
  assert.equal(p.muscle, 1000)
  assert.equal(p.level, levelCap(0))
})

test('dumbbells, Train Zones and rebirths multiply lifts', () => {
  const p = createProfile('a', 'A')
  applyLift(p, -1, 0)
  assert.equal(p.muscle, 1)
  p.ownedDumbbells.push('iron', 'steel')
  p.equippedDumbbell = 'steel'
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

test('rebirth needs max level, resets Muscle, keeps Wins and dumbbells', () => {
  const p = createProfile('a', 'A')
  assert.equal(applyRebirth(p).ok, false)
  p.ownedDumbbells.push('iron')
  for (let i = 0; i < 400; i += 1) applyLift(p, -1, 0)
  p.wins = 50
  assert.equal(applyRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.equal(p.muscle, 0)
  assert.equal(p.level, 1)
  assert.equal(p.wins, 50)
  assert.deepEqual(p.ownedDumbbells, ['wood', 'iron'])
})

test('skipping to a rebirth costs Wins', () => {
  const p = createProfile('a', 'A')
  assert.equal(skipRebirth(p).ok, false)
  p.wins = 1e9
  assert.equal(skipRebirth(p).ok, true)
  assert.equal(p.rebirths, 1)
  assert.ok(p.wins < 1e9)
})

test('one power pushes a metre: 20, 200 and 500 power stages, 20, 200 and 500 m long', () => {
  assert.deepEqual(
    STAGES.slice(0, 3).map((st) => [st.need, st.length]),
    [
      [20, 20],
      [200, 200],
      [500, 500],
    ],
  )
  for (let i = 0; i < 3; i += 1) assert.equal(powerPerMeter(i), 1, STAGES[i].id)
  // 20 power: 10 used half way up the first stage, none left at the top.
  assert.equal(stageCost(0, 10), 10)
  assert.equal(stageReach(0, 20), stageTop(0))
  assert.equal(stageReach(0, 10), 10)
  // Each stage's need gets you exactly to its top; a little less, not quite.
  STAGES.forEach((stage, i) => {
    assert.equal(stageReach(i, stage.need), stageTop(i), stage.id)
    assert.ok(stageReach(i, stage.need * 0.9) < stageTop(i), `${stage.id} short of its need`)
    assert.ok(Math.abs(stageCost(i, stageTop(i)) - stage.need) < 1e-6, stage.id)
  })
  // Power is per stage, not for the whole climb: 150 on the second goes 150 m up it.
  assert.equal(stageReach(1, 150), stageStart(1) + 150)
  assert.equal(stageTop(STAGES.length - 1), TRACK_LENGTH)
})

test('flat SAFEZONEs sit between the slopes, and their WINS pads are the only Wins', () => {
  assert.equal(TRACK_LENGTH, STAGES.reduce((sum, st) => sum + st.length, 0) + (STAGES.length - 1) * SAFE_LENGTH)
  // The first SAFEZONE: flat, and it belongs to the stage it leads up to.
  assert.equal(safeStart(1), 20)
  assert.equal(stageStart(1), 20 + SAFE_LENGTH)
  assert.equal(isSlope(5), true)
  assert.equal(isSlope(safeStart(1) + 5), false)
  assert.equal(isSlope(stageStart(1) + 5), true)
  assert.equal(stageAt(safeStart(1) + 1), 1)
  // One pad in each SAFEZONE, and THE TOP's.
  assert.equal(WIN_PADS.length, STAGES.length)
  assert.ok(WIN_PADS[0].meter > safeStart(1) && WIN_PADS[0].end < stageStart(1))
  assert.equal(WIN_PADS.at(-1).meter, TRACK_LENGTH)
  // A climb pays every pad it gets to: with 300 Muscle, the first two.
  assert.equal(runWins(19), 0)
  // A Win for every 2 m climbed up to it: 10 for the first (20 m), 110 by the second (+200 m).
  assert.deepEqual(WIN_PADS.slice(0, 3).map((pad) => pad.wins), [10, 110, 360])
  assert.equal(runWins(20), 10)
  assert.equal(runWins(300), 10 + 100)
})

test('the first push pays enough for the first dumbbell, as the guide asks', () => {
  assert.ok(runWins(TUTORIAL[0].muscle) >= DUMBBELLS[1].cost)
  assert.deepEqual(
    TUTORIAL.map((step) => step.event),
    ['train', 'cashIn', 'buyDumbbell'],
    'train, take the first stage\'s Wins, buy a dumbbell - and that is all',
  )
})

test('the guide: train on a bench, cash in the first stage, buy a dumbbell, done', () => {
  const p = createProfile('a', 'A')
  const pos = onBench(0)
  const { s } = sessionAt(pos, p)
  s.handle('enterZone', { zone: 0 }, 0)
  for (let t = 0; s.profile.muscle < TUTORIAL[0].muscle && t < 200; t += 1) s.tick(1, t * 1000)
  assert.equal(p.tutorialStep, 1, 'trained enough for the first boulder')
  Object.assign(pos, inPushZone())
  s.handle('leaveZone', {}, 0)
  s.handle('startPush', {}, 300000)
  s.handle('pushAt', { meter: stageTop(0), x: 0 }, 304000)
  const pad = WIN_PADS[0]
  s.handle('pushAt', { meter: pad.meter + 1, x: (pad.minX + pad.maxX) / 2 }, 305000)
  assert.equal(p.tutorialStep, 2, 'took the Wins on the WINS pad')
  Object.assign(pos, { x: DUMBBELL_PADS[1].x, y: 0, z: DUMBBELL_PADS[1].z })
  s.handle('buyDumbbell', { id: DUMBBELLS[1].id }, 306000)
  assert.equal(p.tutorialStep, TUTORIAL.length, 'and the guide is over')
})

test('the guide skips a step already done out of order', () => {
  const p = createProfile('a', 'A')
  p.muscle = 25
  const { s } = sessionAt(inPushZone(), p)
  s.handle('startPush', {}, 0)
  s.handle('pushAt', { meter: stageTop(0), x: 0 }, 4000)
  const pad = WIN_PADS[0]
  s.handle('pushAt', { meter: pad.meter + 1, x: (pad.minX + pad.maxX) / 2 }, 5000)
  assert.equal(p.tutorialStep, 2, 'pushed without training: on to buying')
})

test('dumbbells are bought in order with Wins', () => {
  const p = createProfile('a', 'A')
  p.wins = 1000
  assert.equal(buyDumbbell(p, DUMBBELLS[3].id).ok, false)
  assert.equal(buyDumbbell(p, DUMBBELLS[1].id).ok, true)
  assert.equal(p.wins, 1000 - DUMBBELLS[1].cost)
  assert.equal(p.equippedDumbbell, DUMBBELLS[1].id)
})

test('Muscle packs scale with your level', () => {
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
  const p = normalizeProfile({ pets: [{ uid: 1, id: 'nope' }], equippedPets: [1], ownedDumbbells: ['nope'], muscle: 'x', equippedAura: 'water' }, 'x', 'X')
  assert.deepEqual(p.pets, [])
  assert.deepEqual(p.equippedPets, [])
  assert.deepEqual(p.ownedDumbbells, ['wood'])
  assert.equal(p.muscle, 0)
  assert.equal(p.equippedAura, null, 'an aura you never bought')
})

test('the session only trains sitting on a bench where the player really is', () => {
  const pos = { x: 0, y: 0, z: 0 }
  const { s } = sessionAt(pos)
  s.handle('enterZone', { zone: 0 }, 0)
  s.tick(2, 0)
  assert.equal(s.profile.muscle, 0, 'claimed a Train Zone from spawn')
  // Standing on the pad, off its benches, trains nothing.
  Object.assign(pos, { x: ZONE_X + 4, y: 0.4, z: zoneCenterZ(0) + 3.5 })
  s.tick(2, 0)
  assert.equal(s.profile.muscle, 0, 'on the pad but not on a bench')
  Object.assign(pos, onBench(0))
  s.tick(2, 0)
  assert.ok(s.profile.muscle > 0)
  // Anywhere along the long bench counts, side by side with others.
  let before = s.profile.muscle
  Object.assign(pos, { ...onBench(0), z: zoneCenterZ(0) + BENCH_HALF - 0.4 })
  s.tick(2, 0)
  assert.ok(s.profile.muscle > before, 'near the end of the bench')
  // Another zone's bench isn't this zone's.
  Object.assign(pos, onBench(1))
  before = s.profile.muscle
  s.tick(2, 0)
  assert.equal(s.profile.muscle, before)
})

test('lifts are limited to a human clicking rate', () => {
  const { s, p } = sessionAt({ x: 0, y: 0, z: 0 })
  // 200 clicks in the same instant: only the banked burst counts.
  for (let i = 0; i < 200; i += 1) s.handle('lift', {}, 1000)
  assert.ok(p.muscle <= 12, `got ${p.muscle}`)
  // A second later the bucket has refilled by about nine.
  for (let i = 0; i < 200; i += 1) s.handle('lift', {}, 2000)
  assert.ok(p.muscle <= 22, `got ${p.muscle}`)
  assert.equal(p.tutorialStep, 0, 'clicking is not the guide\'s training on a bench')
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

test('a climb starts only from the push zone, and only one at a time', () => {
  const pos = { x: 0, y: 0, z: 14 }
  const { s, of } = sessionAt(pos)
  s.handle('startPush', {}, 1000)
  assert.equal(of('push').length, 0)
  Object.assign(pos, inPushZone())
  s.handle('startPush', {}, 1000)
  assert.equal(of('push').length, 1)
  assert.equal(of('push')[0].payload.stage, 0)
  s.handle('startPush', {}, 1500)
  assert.equal(of('push').length, 1, 'no second push while pushing')
})

test('a climb: push, walk free in the SAFEZONE onto its pad and cash in, or past it to the next boulder', () => {
  const p = createProfile('a', 'A')
  p.muscle = 150
  const { s, of } = sessionAt(inPushZone(), p)
  s.handle('startPush', {}, 0)
  assert.deepEqual(of('push')[0].payload, { stage: 0, reach: stageTop(0), power: 150, start: PUSH_START, x: 0 })
  // Claiming the top at once: only as far as pushing flat out could take you.
  s.handle('pushAt', { meter: 500, x: 0 }, 300)
  assert.ok(s.push.meter < stageTop(0), `got ${s.push.meter}`)
  assert.equal(s.push.phase, 'push')
  // Over the top: free in the SAFEZONE above, which leads to stage 1.
  s.handle('pushAt', { meter: stageTop(0), x: 0 }, 3000)
  assert.equal(s.push.phase, 'free')
  assert.equal(s.push.stage, 1)
  assert.equal(p.wins, 0, 'nothing for the slope itself')
  // A teleport across the SAFEZONE is ignored; beside the pad pays nothing; walking
  // onto it pays, once.
  const padX = (WIN_PADS[0].minX + WIN_PADS[0].maxX) / 2
  s.handle('pushAt', { meter: WIN_PADS[0].meter + 1, x: padX }, 3050)
  assert.equal(p.wins, 0)
  s.handle('pushAt', { meter: WIN_PADS[0].meter + 1, x: -2 }, 4000)
  assert.equal(p.wins, 0, 'not standing on it')
  s.handle('pushAt', { meter: WIN_PADS[0].meter + 1, x: padX }, 4500)
  assert.equal(p.wins, WIN_PADS[0].wins)
  // Cashed in: the climb's over, back to the lobby.
  assert.equal(s.push, null)
  assert.deepEqual(of('pushEnd')[0].payload, { reason: 'win' })

  // Again, but walking past the pad (on the left) to the next boulder.
  s.handle('startPush', {}, 6000)
  s.handle('pushAt', { meter: stageTop(0), x: 0 }, 9000)
  assert.equal(s.push.phase, 'free')
  s.handle('pushAt', { meter: WIN_PADS[0].meter + 1, x: -2 }, 9500)
  assert.equal(p.wins, WIN_PADS[0].wins, 'walked past it')
  // Too far from the next boulder to take it; by it, you take it with all your Muscle.
  s.handle('startPush', {}, 9600)
  assert.equal(of('push').length, 2)
  s.handle('pushAt', { meter: stageStart(1) + PUSH_START, x: 0 }, 10500)
  s.handle('startPush', {}, 10600)
  assert.equal(of('push').length, 3)
  assert.deepEqual(of('push')[2].payload, { stage: 1, reach: stageStart(1) + 150, power: 150, start: stageStart(1) + PUSH_START, x: 0 })
  // Letting go at the foot of stage 1: back in its SAFEZONE, free; Lobby: back in the plaza.
  s.handle('endPush', { reason: 'release' }, 14000)
  assert.equal(s.push.phase, 'free')
  assert.equal(s.push.stage, 1)
  assert.equal(of('pushEnd').length, 1)
  s.handle('endPush', { reason: 'left' }, 14500)
  assert.equal(s.push, null)
  assert.deepEqual(of('pushEnd')[1].payload, { reason: 'left' })
})

test('Wins orbs up every slope pay once a climb, and only when the boulder is by them', () => {
  const track = TRACKS[0]
  // Every stage has some, each in its slope; past the first three (a Win an orb at
  // least), together about ORBS.share of the stage's Wins.
  track.stages.forEach((st, i) => {
    const on = track.orbsOn[i]
    assert.ok(on.length >= ORBS.group, st.id)
    for (const orb of on) assert.ok(orb.meter > track.stageStart(i) && orb.meter < track.stageTop(i), st.id)
    if (i > 2) assert.ok(Math.abs(on.reduce((sum, orb) => sum + orb.wins, 0) / (st.wins * ORBS.share) - 1) < 0.1, st.id)
  })
  const p = createProfile('a', 'A')
  p.muscle = 300
  const { s, of } = sessionAt(inPushZone(), p)
  s.handle('startPush', {}, 0)
  const orb = track.orbsOn[0].at(-1)
  s.handle('collectOrb', { index: orb.index }, 100)
  assert.equal(p.wins, 0, 'not up to it yet')
  s.handle('pushAt', { meter: orb.meter - 2, x: -orb.side }, 2000)
  s.handle('collectOrb', { index: orb.index }, 2010)
  assert.equal(p.wins, 0, 'the other side of the track')
  s.handle('pushAt', { meter: orb.meter - 2, x: orb.side }, 2100)
  s.handle('collectOrb', { index: orb.index }, 2110)
  assert.equal(p.wins, orb.wins)
  s.handle('collectOrb', { index: orb.index }, 2200)
  assert.equal(p.wins, orb.wins, 'once a climb')
  assert.equal(of('orb').length, 1)
  // Nor one on another stage.
  s.handle('collectOrb', { index: track.orbsOn[1][0].index }, 2300)
  assert.equal(p.wins, orb.wins)
})

test('crushed on any stage, you go back to the lobby', () => {
  const p = createProfile('a', 'A')
  p.muscle = 300
  const { s, of } = sessionAt(inPushZone(), p)
  s.handle('startPush', {}, 0)
  s.handle('pushAt', { meter: stageTop(0), x: 0 }, 4000)
  s.handle('pushAt', { meter: stageStart(1) + PUSH_START, x: 0 }, 5000)
  s.handle('startPush', {}, 5100)
  assert.equal(s.push.stage, 1)
  s.handle('endPush', { reason: 'crushed' }, 9000)
  assert.equal(s.push, null, 'not left in the SAFEZONE')
  assert.deepEqual(of('pushEnd')[0].payload, { reason: 'crushed' })
})

test('crushed on the first stage, you go back to the plaza', () => {
  const p = createProfile('a', 'A')
  p.muscle = 4
  const { s, of } = sessionAt(inPushZone(), p)
  s.handle('startPush', {}, 0)
  assert.equal(of('push')[0].payload.reach, 4)
  s.handle('endPush', { reason: 'crushed' }, 2000)
  assert.equal(s.push, null)
  assert.deepEqual(of('pushEnd')[0].payload, { reason: 'crushed' })
})

test('a push nobody reports on ends by itself', () => {
  const { s, of } = sessionAt(inPushZone())
  s.handle('startPush', {}, 0)
  s.tick(0.1, 31000)
  assert.equal(s.push, null)
  assert.equal(of('pushEnd')[0].payload.reason, 'timeout')
})

test('the Future World portal badges you only from its swirl, with its Wins', () => {
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
  assert.equal(s.profile.world, 1, 'into Future World')
  // Back through to World 1, and - having been - in again without the Wins.
  s.handle('portal', {}, 0)
  assert.equal(s.profile.world, 0)
  s.profile.wins = 0
  s.handle('portal', {}, 0)
  assert.equal(s.profile.world, 1)
})

test('World 1 has 13 stages and Future World 7, each paying Wins for how hard it is', () => {
  assert.equal(WORLDS[0].stages.length, 13)
  assert.equal(WORLDS[1].stages.length, 7)
  assert.deepEqual(
    WORLDS[0].stages.map((st) => st.need),
    [20, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 2000000],
  )
  // Every stage pays half its need - on the first three, a Win for every 2 m.
  for (const world of WORLDS) for (const st of world.stages) assert.equal(st.wins, st.need / 2, st.id)
  assert.equal(TRACKS[1].winPads[0].wins, WORLDS[1].stages[0].wins)
  assert.equal(TRACKS[0].winPads.at(-1).wins, WORLDS[0].stages.reduce((sum, st) => sum + st.wins, 0))
  // Every stage of every world needs more than the one before it.
  for (const world of WORLDS) world.stages.forEach((st, i) => i && assert.ok(st.need > world.stages[i - 1].need, st.id))
})

test('a climb in Future World is on its track, start to WINS pad', () => {
  const pos = inPushZone()
  const p = createProfile('a', 'A')
  p.world = 1
  p.muscle = 5000000
  const { s, events } = sessionAt(pos, p)
  const of = (type) => events.filter((e) => e.type === type)
  const track = TRACKS[1]
  s.handle('startPush', {}, 0)
  assert.equal(of('push')[0].payload.reach, track.stageTop(0), 'its first stage needs 5M')
  for (let t = 1; t <= 80; t += 1) s.handle('pushAt', { meter: Math.min(track.stageTop(0), t * 6.5), x: 0 }, t * 1000)
  assert.equal(s.push.phase, 'free')
  const pad = track.winPads[0]
  s.handle('pushAt', { meter: pad.meter + 1, x: (pad.minX + pad.maxX) / 2 }, 82000)
  assert.equal(p.wins, pad.wins)
  assert.equal(s.push, null, 'cashed in')
})

test('only the trip back from the push zone skips the speed check', () => {
  assert.equal(isPushReturn(inPushZone(), PUSH_RETURN), true)
  assert.equal(isPushReturn(SPAWN, PUSH_RETURN), false, 'not from elsewhere in the lobby')
  assert.equal(isPushReturn(inPushZone(), SPAWN), false, 'not to anywhere else')
})

test('walking speed grows with every level ever reached, and never drops on rebirth', () => {
  assert.equal(walkSpeed(1, 0), 10)
  assert.ok(walkSpeed(5, 0) > walkSpeed(1, 0))
  assert.ok(walkSpeed(1, 1) >= walkSpeed(5, 0), 'a rebirth keeps you as quick')
  assert.ok(walkSpeed(30, 5) <= 13.5)
})

test('walking earns no Muscle: only lifting does', () => {
  const pos = { x: 0, y: 0, z: 10 }
  const { s, p } = sessionAt(pos)
  s.tick(0.1, 0)
  // Walk 41 m round the lobby at 8.2 m/s.
  for (let i = 1; i <= 50; i += 1) {
    pos.x += 0.82
    s.tick(0.1, i * 100)
  }
  assert.equal(p.muscle, 0)
})

test('dumbbells can only be bought standing on their pad', () => {
  const pos = { x: 0, y: 0, z: 0 }
  const p = createProfile('a', 'A')
  p.wins = 100
  const { s } = sessionAt(pos, p)
  s.handle('buyDumbbell', { id: 'iron' }, 0)
  assert.equal(p.ownedDumbbells.length, 1)
  Object.assign(pos, { x: DUMBBELL_PADS[1].x, z: DUMBBELL_PADS[1].z })
  s.handle('buyDumbbell', { id: 'iron' }, 0)
  assert.equal(p.ownedDumbbells.length, 2)
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
  assert.equal(p.muscle, 2, 'x2 Muscle doubles gains')
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
