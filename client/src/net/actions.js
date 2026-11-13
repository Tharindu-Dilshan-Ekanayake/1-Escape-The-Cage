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
  /** One click: a lift with your dumbbell. */
  lift: () => send('lift'),
  enterZone: (zone) => send('enterZone', { zone }),
  leaveZone: () => send('leaveZone'),
  /** Starts a push; only counts standing on the PUSH ZONE (walking onto it sends it). */
  startPush: () => send('startPush'),
  /** Where you've got to up the track (a few times a second while pushing). */
  pushAt: (meter, x) => send('pushAt', { meter, x }),
  endPush: (reason) => send('endPush', { reason }),
  /** The boulder rolled into Wins orb `index`. */
  collectOrb: (index) => send('collectOrb', { index }),
  /** A Boxity emote started ('' when it stops), so the room sees it. */
  emote: (id) => send('emote', { id }),
  /** Back to the spawn point (Boxity's "Reset Character"). */
  respawn: () => send('respawn'),
  rebirth: () => send('rebirth'),
  skipRebirth: () => send('skipRebirth'),
  buyDumbbell: (id) => send('buyDumbbell', { id }),
  equipDumbbell: (id) => send('equipDumbbell', { id }),
  equipAura: (id) => send('equipAura', { id }),
  /** Buys Muscle pack `index` (0-2) from under the level bar. */
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
