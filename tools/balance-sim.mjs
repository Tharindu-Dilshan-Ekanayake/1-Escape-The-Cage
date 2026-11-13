/**
 * Balance simulator: plays the game with the real rules (shared/logic.js) and tables
 * (shared/balance.js) and prints when a typical player gets each cage, body, pet egg and
 * rebirth, and the longest stretches with nothing new - the boredom check.
 *
 *   node tools/balance-sim.mjs              typical player (4 taps a second)
 *   node tools/balance-sim.mjs --cps 2      a lazier one
 *   node tools/balance-sim.mjs --quiet      summary only
 *
 * The player it models sits on the best bench they have and taps; runs the cages
 * whenever they can get further than last time, and otherwise every `block` seconds to
 * farm their best pad; spends Wins at once - next body first, then passes, then eggs -
 * and rebirths as soon as max level comes. No potions, daily rewards or offline
 * training: those only make it quicker.
 */
import { fileURLToPath } from 'node:url'

import { BODIES, EGGS, levelCap, PETS, SHOP, TRAIN_INTERVAL, TRAIN_ZONES, walkSpeed, WORLDS } from '../shared/balance.js'
import { formatNumber } from '../shared/format.js'
import {
  applyRebirth,
  breakTime,
  buyBody,
  buyShopItem,
  cagesBefore,
  createProfile,
  equipBestPets,
  hatchEgg,
  isMaxLevel,
  isZoneUnlocked,
  levelFor,
  liftGain,
  nextBody,
  padWins,
  petMultiplier,
} from '../shared/logic.js'
import { mulberry32 } from '../shared/rng.js'
import { GAUNTLET } from '../shared/world.js'

/** Longest a player taps at one cage before giving up on it this run. */
const MAX_BREAK_S = 20
/** Walk from the gyms to the first cage, and back from where a WIN pad drops you. */
const LOBBY_WALK = 45
const TOTAL_CAGES = WORLDS.reduce((sum, w) => sum + w.cages.length, 0)
const PASS_ORDER = ['muscleX2', 'winsX2', 'auraLightning', 'zoneVeryOp', 'auraGalaxy', 'muscleX3', 'winsX3', 'auraWater', 'zoneBest', 'vip', 'auraFire', 'auraRainbow']

export const fmtTime = (s) => {
  if (s < 3600) return `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
}

/**
 * Plays from a fresh save for up to `hours` of playtime, or until every cage is broken.
 * `cps`: taps a second training; `tps`: taps a second at a cage; `block`: seconds of
 * training between farming runs. Returns the milestones `{ t, kind, text }`, the
 * playtime simulated and the save.
 */
export function simulate({ hours = 120, cps = 4, tps = 6, block = 75 } = {}) {
  const rand = mulberry32(7)
  const p = createProfile('sim', 'Sim')
  const events = []
  let t = 0
  let lastRunAt = 0
  let bestReach = 0
  const log = (kind, text, extra = {}) => events.push({ t, kind, text, ...extra })

  const bestZone = () => TRAIN_ZONES.reduce((best, zone, i) => (isZoneUnlocked(p, i) && zone.mult > TRAIN_ZONES[best].mult ? i : best), 0)
  /** Strength a second, sat on your best bench tapping. */
  const strengthRate = () => liftGain(p, bestZone(), 0) * (cps + 1 / TRAIN_INTERVAL)

  /** How deep a run gets now, and the time spent breaking on the way. */
  const plan = () => {
    const cages = WORLDS[p.world].cages
    let reach = 0
    let breaking = 0
    while (reach < cages.length) {
      const s = breakTime(p.muscle, cages[reach].need, tps)
      if (s > MAX_BREAK_S) break
      breaking += s
      reach += 1
    }
    return { reach, breaking }
  }

  const run = () => {
    const { reach, breaking } = plan()
    const v = walkSpeed(p.level, p.rebirths)
    const time = (LOBBY_WALK * 2 + (reach - 0.5) * GAUNTLET.roomDepth) / v + breaking + 2
    t += time
    const wins = padWins(p, reach - 1, 0)
    p.wins += wins
    p.stats.runs += 1
    lastRunAt = t
    const number = cagesBefore(p.world) + reach
    if (number > bestReach) {
      bestReach = number
      const cage = WORLDS[p.world].cages[reach - 1]
      log('cage', `CAGE ${number} ${cage.name} (need ${formatNumber(cage.need)}) pad ${formatNumber(wins)} Wins, run ${Math.round(time)}s, ${formatNumber(strengthRate())}/s`, { number })
    }
  }

  const shop = () => {
    for (;;) {
      const body = nextBody(p)
      if (body && p.wins >= body.cost) {
        buyBody(p, body.id)
        log('body', `${body.name} (x${formatNumber(body.power)}) for ${formatNumber(body.cost)}`)
        continue
      }
      const pass = PASS_ORDER.find((id) => !p.passes[id] && p.wins >= SHOP[id].price && !(body && body.cost < SHOP[id].price * 0.5))
      if (pass) {
        buyShopItem(p, pass)
        log('pass', `${SHOP[pass].name} for ${formatNumber(SHOP[pass].price)}`)
        continue
      }
      // Eggs: the best costing at most a third of what's in hand, if its pets beat what's equipped.
      const equipped = p.equippedPets.map((uid) => PETS[p.pets.find((x) => x.uid === uid).id].mult)
      const worst = equipped.length < 3 ? 1 : Math.min(...equipped)
      const [eggId, egg] =
        Object.entries(EGGS)
          .filter(([, e]) => e.cost.wins <= p.wins / 3)
          .sort((a, b) => b[1].cost.wins - a[1].cost.wins)[0] ?? []
      if (!egg || p.pets.length >= 58) return
      const avg = egg.pets.reduce((sum, [id, w]) => sum + PETS[id].mult * w, 0) / 100
      if (avg <= worst * 1.05) return
      const hatched = hatchEgg(p, eggId, 1, { rand })
      if (!hatched.ok) return
      equipBestPets(p)
      if (!events.some((e) => e.kind === 'egg' && e.text.startsWith(egg.name))) {
        log('egg', `${egg.name} Egg first hatch (${formatNumber(egg.cost.wins)}) -> ${PETS[hatched.pets[0].id].name}`)
      }
    }
  }

  while (t < hours * 3600 && bestReach < TOTAL_CAGES) {
    shop()
    if (isMaxLevel(p)) {
      const before = p.muscle
      applyRebirth(p)
      log('rebirth', `REBIRTH ${p.rebirths} (gave up ${formatNumber(before)} Strength) -> cap L${levelCap(p.rebirths)}`)
    }
    if (p.world === 0 && bestReach >= WORLDS[0].cages.length && p.wins >= WORLDS[1].wins) {
      p.world = 1
      p.badges.push(WORLDS[1].id)
      log('world', `PORTAL to ${WORLDS[1].name}`)
    }
    const { reach } = plan()
    if (reach > 0 && (cagesBefore(p.world) + reach > bestReach || t - lastRunAt >= block)) {
      run()
      continue
    }
    p.muscle += strengthRate()
    p.stats.bestMuscle = Math.max(p.stats.bestMuscle, p.muscle)
    p.level = levelFor(p.muscle, p.rebirths)
    t += 1
  }
  if (bestReach >= TOTAL_CAGES) log('end', 'ALL CAGES BROKEN')
  return { events, t, p }
}

export function report({ events, t, p }, { quiet = false } = {}) {
  if (!quiet) {
    for (const e of events) {
      const mark = { cage: '#', body: '+', rebirth: '*', egg: 'o', pass: '$', world: '@', end: '!' }[e.kind]
      console.log(`${fmtTime(e.t).padStart(7)}  ${mark} ${e.text}`)
    }
  }
  const gaps = []
  for (let i = 1; i < events.length; i += 1) gaps.push({ from: events[i - 1].t, gap: events[i].t - events[i - 1].t, next: events[i].text })
  gaps.sort((a, b) => b.gap - a.gap)
  console.log('\nLongest waits for something new (cage, body, rebirth, egg or pass):')
  for (const g of gaps.slice(0, 6)) console.log(`  ${fmtTime(g.gap).padStart(7)} after ${fmtTime(g.from).padStart(7)} -> ${g.next}`)
  console.log('\nCages (playtime, and the day at 45 minutes a day):')
  for (const e of events.filter((x) => x.kind === 'cage')) {
    console.log(`  ${e.text.split(' (')[0].padEnd(24)} ${fmtTime(e.t).padStart(7)}   day ${String(1 + Math.floor(e.t / 2700)).padStart(3)}`)
  }
  console.log(
    `\nAfter ${fmtTime(t)}: Strength ${formatNumber(p.muscle)}, Wins ${formatNumber(p.wins)}, rebirths ${p.rebirths}, ` +
      `bodies ${p.ownedBodies.length}/${BODIES.length}, pets x${petMultiplier(p).toFixed(1)}, runs ${p.stats.runs}`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  const num = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? Number(args[i + 1]) : fallback
  }
  report(simulate({ hours: num('hours', 120), cps: num('cps', 4), tps: num('tps', 6), block: num('block', 75) }), { quiet: args.includes('--quiet') })
}
