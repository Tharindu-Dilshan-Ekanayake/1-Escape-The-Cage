import { BODIES, EGGS, PETS, SHOP, TRAIN_ZONES, WORLD_PORTALS, WORLDS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { isZoneUnlocked } from '@shared/logic'
import {
  BODY_PADS,
  AURA_STAND,
  EGG_STANDS,
  FREE_REWARD,
  PORTALS,
  POTION_STAND,
  SHOP as SHOP_YARD,
  SPHINX_STAND,
  STATUE,
  ZONE_X,
  zoneCenterZ,
} from '@shared/world'

import { bodyLook } from '../bodies'
import { eggHeight } from '../world/eggs'
import { ZONE_THEMES } from '../world/structures'

/**
 * Text styles, as gradients top-to-bottom, matching the reference signage.
 */
export const TEXT = {
  gold: ['#fffaa8', '#ffd52a', '#ff9c00'],
  green: ['#e6ffb0', '#8dff4f', '#2fd12f'],
  price: ['#d9ff9a', '#7dff4a', '#2fd12f'],
  white: ['#ffffff', '#ffffff', '#dfe7f0'],
  red: ['#ffb0a8', '#ff4a3b', '#d4142a'],
  blue: ['#e0faff', '#7fe2ff', '#2fa8ff'],
  orange: ['#fff1c2', '#ffb03b', '#ff6a00'],
  purple: ['#f3d9ff', '#c27bff', '#7a2fd6'],
}

const tint = (hex) => ['#ffffff', hex, hex]

/** "1X STRENGTH / FREE", "2X STRENGTH / 1 Rebirth", "25X STRENGTH / VERY OP! / 200K Wins"... */
export function zoneLabelSpec(index, unlocked) {
  const zone = TRAIN_ZONES[index]
  const theme = ZONE_THEMES[index]
  const lines = [{ text: `${zone.mult}X STRENGTH`, size: 58, icon: 'muscle', gradient: tint(theme.text) }]
  if (unlocked) {
    lines.push({ text: zone.rebirths === 0 && !zone.product ? 'FREE' : 'UNLOCKED', size: 46, gradient: TEXT.green })
  } else if (zone.product) {
    lines.push({ text: zone.tag, size: 46, rainbow: true })
    lines.push({ text: `${formatNumber(SHOP[zone.product].price)} Wins`, size: 42, icon: 'trophy', gradient: TEXT.gold })
  } else {
    const word = zone.rebirths === 1 ? 'Rebirth' : 'Rebirths'
    lines.push({ text: `${zone.rebirths} ${word}`, size: 48, icon: 'rebirth', gradient: TEXT.green })
  }
  return { lines, pxPerUnit: 64 }
}

/** Largest a zone label can get, so its atlas slot fits every state. */
const zoneReserve = (index) => {
  const zone = TRAIN_ZONES[index]
  const lines = [{ text: `${zone.mult}X STRENGTH`, size: 58, icon: 'muscle' }]
  if (zone.product) {
    lines.push({ text: zone.tag, size: 46 })
    lines.push({ text: `${formatNumber(SHOP[zone.product].price)} Wins`, size: 42, icon: 'trophy' })
  } else {
    lines.push({ text: 'UNLOCKED', size: 48, icon: 'rebirth' })
  }
  return { lines }
}

export function zoneLabels(profile) {
  return TRAIN_ZONES.map((zone, i) => ({
    id: `zone-${i}`,
    position: [ZONE_X + 0.6, zone.product ? 5.2 : 4.6, zoneCenterZ(i)],
    spec: zoneLabelSpec(i, isZoneUnlocked(profile, i)),
    reserve: zoneReserve(i),
    fade: 150,
  }))
}

/** Ownership state of each body shop pad: 'equipped' | 'owned' | 'buy' | 'locked'. */
export function padState(profile, index) {
  const body = BODIES[index]
  if (profile.equippedBody === body.id) return 'equipped'
  if (profile.ownedBodies.includes(body.id)) return 'owned'
  const previous = BODIES[index - 1]
  return !previous || profile.ownedBodies.includes(previous.id) ? 'buy' : 'locked'
}

/** "Golden Body" over "x90 Strength" over "500K Wins", "OWNED" or "WEARING". */
export function padLabelSpec(index, state) {
  const body = BODIES[index]
  const status =
    state === 'equipped'
      ? { text: 'WEARING', size: 40, gradient: TEXT.gold }
      : state === 'owned'
        ? { text: 'OWNED', size: 40, gradient: TEXT.blue }
        : { text: body.cost === 0 ? 'FREE' : `${formatNumber(body.cost)} Wins`, size: 40, icon: 'trophy', gradient: state === 'locked' ? TEXT.red : TEXT.price }
  const lines = [
    { text: body.name, size: 40, fill: '#ffffff' },
    { text: bodyLook(body.id).type, size: 34, gradient: TEXT.blue },
    { text: `x${formatNumber(body.power)} Strength`, size: 42, icon: 'muscle', gradient: TEXT.gold },
    status,
  ]
  if (body.tag) lines.unshift({ text: body.tag, size: 46, rainbow: true })
  return { lines, pxPerUnit: 70 }
}

/** Largest a pad label can get, so its atlas slot fits every state. */
const padReserve = (index) => {
  const body = BODIES[index]
  const lines = [
    { text: body.name, size: 40 },
    { text: bodyLook(body.id).type, size: 34 },
    { text: `x${formatNumber(body.power)} Strength`, size: 42, icon: 'muscle' },
    { text: `${formatNumber(body.cost)} Wins`, size: 40, icon: 'trophy' },
  ]
  if (body.tag) lines.unshift({ text: body.tag, size: 46 })
  return { lines }
}

export function padLabels(profile) {
  return BODY_PADS.map((pad) => ({
    id: `pad-${pad.index}`,
    // Each row back rides higher, so they clear the rows in front seen from the plaza.
    position: [pad.x, pad.y + 5.2 + pad.row * 1.25 + (BODIES[pad.index].tag ? 0.8 : 0), pad.z],
    spec: padLabelSpec(pad.index, padState(profile, pad.index)),
    reserve: padReserve(pad.index),
    fade: 70,
  }))
}

export function eggLabels() {
  return EGG_STANDS.map((stand) => {
    const egg = EGGS[stand.eggId]
    const lines = stand.big
      ? [
          { text: 'Demon Egg', size: 54, gradient: TEXT.red },
          { text: `${formatNumber(egg.cost.wins)} Wins`, size: 46, icon: 'trophy', gradient: TEXT.gold },
        ]
      : [
          { text: `${egg.name} Egg`, size: 50, fill: '#ffffff' },
          { text: `${formatNumber(egg.cost.wins)} Wins`, size: 44, icon: 'trophy', gradient: TEXT.gold },
        ]
    return {
      id: `egg-${stand.eggId}`,
      position: [stand.x, eggHeight(stand) + (stand.big ? 4 : 2.5), stand.z],
      spec: { lines, pxPerUnit: 62 },
      fade: 100,
    }
  })
}

/** The limited Sphinx showcase: price, hype, and live stock. */
export function sphinxLabelSpec(stock) {
  const mult = PETS.sphinx.mult
  return {
    lines: [
      { text: `${formatNumber(SHOP.sphinx.price)} Wins`, size: 46, icon: 'trophy', gradient: TEXT.gold },
      { text: 'BEST IN GAME', size: 56, gradient: TEXT.red },
      { text: 'Sphinx', size: 76, fill: '#ffffff' },
      { text: `${formatNumber(mult * 100 - 100)}% BETTER`, size: 54, rainbow: true },
      { text: `${formatNumber(stock)} Left`, size: 50, gradient: TEXT.green },
    ],
    pxPerUnit: 48,
  }
}

export function sphinxLabel(stock) {
  return {
    id: 'sphinx',
    position: [SPHINX_STAND.x, 11.5, SPHINX_STAND.z],
    spec: sphinxLabelSpec(stock),
    reserve: sphinxLabelSpec(88888),
    fade: 140,
  }
}

/** A big two-line sign over an area of the plaza: its name, and what it's for. */
const title = (id, position, name, sub, gradient, fade = 120) => ({
  id,
  position,
  spec: {
    lines: [
      { text: name, size: 72, gradient },
      { text: sub, size: 34, fill: '#ffffff' },
    ],
    pxPerUnit: 54,
  },
  fade,
})

/** The section signs, the free reward, the portal and the statue's challenge. */
function placeLabels() {
  const portal = PORTALS[0]
  return [
    title('title-zones', [ZONE_X + 8, 7.4, 4], 'Train Zones', 'Sit on a bench for EXTRA STRENGTH!', TEXT.orange, 90),
    title('title-bodies', [SHOP_YARD.minX - 2, 3.6, 4], 'Bodies', 'Buy a bodybuilder BODY for your avatar!', TEXT.blue, 90),
    title('title-auras', [AURA_STAND.x, 7.4, AURA_STAND.z - 3.2], 'Auras', 'Buy and Equip Auras!', TEXT.purple, 70),
    title('title-potions', [POTION_STAND.x + 1, 5.6, POTION_STAND.z], 'Potions', 'Use and Buy Potions Here!', TEXT.green, 70),
    title('title-eggs', [0, 4.6, EGG_STANDS[0].z], 'Pets', 'Hatch eggs for pets: more Strength!', TEXT.gold, 90),
    {
      id: 'free-reward',
      position: [FREE_REWARD.x, 4.6, FREE_REWARD.z],
      spec: { lines: [{ text: 'FREE REWARD', size: 50, gradient: ['#fff2b0', '#ffb347', '#ff6a1e'] }], pxPerUnit: 60 },
      fade: 90,
    },
    {
      id: `portal-${portal.id}`,
      position: [portal.x, portal.radius * 2 + 3, portal.z],
      spec: portalLabelSpec(portal.id, 0),
      reserve: portalLabelSpec(portal.id, 0),
      fade: 140,
    },
    {
      id: 'statue',
      position: [STATUE.x, 13.8, STATUE.z],
      spec: { lines: [{ text: 'CAN YOU ESCAPE', size: 46, fill: '#ffffff' }, { text: 'EVERY CAGE?', size: 62, gradient: TEXT.gold }], pxPerUnit: 40 },
      fade: 140,
    },
  ]
}

/** World portal `id`'s sign, seen from world `world`: where it goes, or back to World 1. */
export function portalLabelSpec(id, world) {
  const portal = WORLD_PORTALS[id]
  if (world === portal.world) {
    return {
      lines: [
        { text: 'WORLD 1', size: 60, gradient: TEXT.green },
        { text: 'Step in to go back!', size: 40, fill: '#ffffff' },
        { text: ' ', size: 40, fill: '#ffffff' },
      ],
      pxPerUnit: 52,
    }
  }
  return {
    lines: [
      { text: portal.name.toUpperCase(), size: 60, gradient: TEXT.blue },
      { text: `${WORLDS[portal.world].cages.length} NEW CAGES!`, size: 40, fill: '#ffffff' },
      { text: `Need ${formatNumber(portal.wins)} Wins`, size: 40, icon: 'trophy', gradient: TEXT.gold },
    ],
    pxPerUnit: 52,
  }
}

/** Every label in the lobby. */
export function lobbyLabels(profile, { sphinxStock = 0 } = {}) {
  return [...zoneLabels(profile), ...padLabels(profile), ...eggLabels(), sphinxLabel(sphinxStock), ...placeLabels()]
}
