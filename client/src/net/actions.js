/**
 * Player intents. The UI never changes game state itself: it calls one of these, the
 * authority (the Colyseus room, or the offline stand-in) validates it, and the result
 * comes back as an updated profile or an event.
 */

let transport = null

/** Installs the active connection: `{ send(type, payload) }`. */
export function setTransport(next) {
  transport = next
}

export function send(type, payload) {
  if (!transport) return
  transport.send(type, payload)
}

export const actions = {
  /** One tap: a lift with your arms. */
  lift: () => send('lift'),
  enterZone: (zone) => send('enterZone', { zone }),
  leaveZone: () => send('leaveZone'),
  /** One tap at the bars of the cage you're standing at. */
  hit: () => send('hit'),
  /** Stepped onto room `pad`'s WIN pad, standing at (x, z). */
  claimPad: (pad, x, z) => send('claimPad', { pad, x, z }),
  /** A Boxity emote started ('' when it stops), so the room sees it. */
  emote: (id) => send('emote', { id }),
  /** Back to the spawn point (Boxity's "Reset Character"). */
  respawn: () => send('respawn'),
  rebirth: () => send('rebirth'),
  skipRebirth: () => send('skipRebirth'),
  /** Buys body `id` (the next one), or puts it on if you have it. */
  buyBody: (id) => send('buyBody', { id }),
  equipBody: (id) => send('equipBody', { id }),
  equipAura: (id) => send('equipAura', { id }),
  /** Buys Strength pack `index` (0-2) from under the level bar. */
  buyPack: (index) => send('buyPack', { index }),
  hatch: (eggId, count = 1) => send('hatch', { eggId, count }),
  openEggItem: (itemId) => send('openEggItem', { itemId }),
  equipPet: (uid) => send('equipPet', { uid }),
  unequipPet: (uid) => send('unequipPet', { uid }),
  equipBestPets: () => send('equipBest'),
  deletePet: (uid) => send('deletePet', { uid }),
  usePotion: (itemId) => send('usePotion', { itemId }),
  claimDaily: (day) => send('claimDaily', { day }),
  claimPlaytime: (index) => send('claimPlaytime', { index }),
  claimFreeReward: () => send('claimFreeReward'),
  setSetting: (key, value) => send('setting', { key, value }),
  portal: () => send('portal'),
  /** Buys a shop item with Wins; see shop.js. */
  purchase: (productId) => send('purchase', { productId }),
}
