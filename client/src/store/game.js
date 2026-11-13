import { create } from 'zustand'

import { SPHINX_STOCK_DEFAULT } from '@shared/balance'
import { createProfile, createSession } from '@shared/logic'

/**
 * Everything the UI renders from. Written by the network layer (profile, events) and
 * the 10 Hz game ticker (zones, timers) - never from a frame loop.
 *
 * Components must select narrowly (`useGame((s) => s.profile.wins)`), so a Muscle tick
 * re-renders the Muscle label and nothing else.
 */

export const useGame = create((set) => ({
  /** Authoritative copy of the player's save, as last sent by the server. */
  profile: createProfile('local', 'Player'),
  /** Per-connection state: session start, claimed playtime rewards. */
  session: createSession(Date.now()),
  /** True once the first real profile has arrived. */
  profileLoaded: false,
  /** True once the game is on screen; non-essential start-up work waits for it. */
  playable: false,

  net: {
    /** 'connecting' | 'online' | 'offline' */
    mode: 'connecting',
    lobbyId: null,
    /** Short code friends join with, for private lobbies. */
    code: null,
    isPrivate: false,
    players: 1,
    maxPlayers: 8,
    message: null,
  },
  sphinxStock: SPHINX_STOCK_DEFAULT,
  leaderboards: null,

  /** Where the player is standing, from the ticker. */
  zone: {
    trainZone: -1,
    trainZoneNear: -1,
    pushZone: false,
    pad: -1,
    egg: null,
    portal: null,
    freeReward: false,
    sphinx: false,
    auras: false,
    potions: false,
    /** Up the mountain, in a SAFEZONE by the next boulder: that stage's index, else -1. */
    climbBoulder: -1,
  },

  /** Which modal panel is open: 'rebirth' | 'daily' | 'pets' | 'items' | 'store' | ... */
  panel: null,
  /** Extra data for the open panel (e.g. which egg the hatch panel is for). */
  panelData: null,

  /** True while you're up the mountain (the frame-rate state is push in pushControl). */
  pushing: false,
  /** True while Boxity shows an ad break: the game stands still. */
  paused: false,
  /**
   * Crushed, and waiting to respawn (Boxity's death screen):
   * `{ stage, need, seconds }`, seconds being Boxity's countdown (0: Respawn may be pressed).
   */
  death: null,
  /** Up the mountain: 'push' (pushing a boulder) or 'free' (walking a SAFEZONE); null in the plaza. */
  climb: null,
  /** The big message of the moment up the track: { kind: 'clear' | 'crushed' | 'top', ..., id }. */
  pushBanner: null,
  /**
   * The Wins the counter shows while a cashed-in climb's Wins fly home to it (it counts up
   * as each trophy lands); null the rest of the time, when it shows your Wins.
   */
  winsShown: null,
  /** Active hatch animation: { eggId, pets }. */
  hatch: null,
  /** Keep hatching the egg you're standing at (the T button). Client-side only. */
  autoHatch: false,

  // --- Actions -----------------------------------------------------------------

  setProfile: (profile, session) =>
    set((s) => ({ profile, session: session || s.session, profileLoaded: true })),
  patchProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
  setNet: (patch) => set((s) => ({ net: { ...s.net, ...patch } })),
  setZone: (zone) => set({ zone }),
  setPlayable: () => set({ playable: true }),
  setSphinxStock: (sphinxStock) => set({ sphinxStock }),
  setLeaderboards: (leaderboards) => set({ leaderboards }),

  openPanel: (panel, panelData = null) => set({ panel, panelData }),
  closePanel: () => set({ panel: null, panelData: null }),
  togglePanel: (panel) => set((s) => (s.panel === panel ? { panel: null, panelData: null } : { panel, panelData: null })),

  setPaused: (paused) => set({ paused }),
  setDeath: (death) => set({ death }),
  setPushing: (pushing) => set(pushing ? { pushing, panel: null, panelData: null } : { pushing, pushBanner: null }),
  setClimb: (climb) => set({ climb }),
  showPushBanner: (banner) => set({ pushBanner: banner ? { ...banner, id: performance.now() } : null }),
  /** Holds the Wins counter at `wins` (what you had before a payout), for the Wins on their way to it. */
  holdWins: (wins) => set((s) => ({ winsShown: s.winsShown ?? Math.min(wins, s.profile.wins) })),
  /** Some of them have landed: the counter counts up (never past your real Wins). */
  landWins: (amount) => set((s) => (s.winsShown === null ? {} : { winsShown: Math.min(s.profile.wins, Math.round(s.winsShown + amount)) })),
  /** All home: the counter shows your Wins again. */
  showWins: () => set({ winsShown: null }),

  setHatch: (hatch) => set({ hatch }),
  setAutoHatch: (autoHatch) => set({ autoHatch }),
}))

/** Non-reactive snapshot for timers and non-React code. */
export const getGame = () => useGame.getState()
