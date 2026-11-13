import { Vector3 } from 'three'

import { SPAWN } from '@shared/world'

/**
 * Per-frame mutable state shared between systems.
 *
 * Deliberately outside React and zustand: it changes every frame, nothing should
 * re-render because of it, and every reader lives in a `useFrame` or a timer. UI that
 * needs a slow-changing derivative of it (which zone the player is in, say) gets it
 * from the 10 Hz game ticker, which is the only thing that copies from here into the
 * store.
 */
export const runtime = {
  player: {
    position: new Vector3(SPAWN.x, 0, SPAWN.z),
    /** Facing, radians about +Y. PI faces north (-Z), towards the cages. */
    yaw: Math.PI,
    speed: 0,
    grounded: true,
    /** The Train Zone whose bench you're sat on, or -1. */
    bench: -1,
    /** When the win dance (back in the lobby after cashing in) started; 0 when not dancing. */
    danceAt: 0,
    /** 'idle' | 'walk' | 'train' (sat on a bench) | 'jump' | 'pull' (at a cage's bars) | 'dance' - what other players see. */
    anim: 'idle',
    /** Set when the controller should ignore input (cashing in on a WIN pad, cutscenes). */
    frozen: false,
    /** performance.now() of the last lift, for the curl. */
    liftedAt: 0,
    /** performance.now() of the last tap at a cage's bars, for the heave on them. */
    pullAt: 0,
    /** The Boxity emote playing: `{ id, at }` (at = performance.now() it started), or null. */
    emote: null,
  },

  /** Touch input, written by the on-screen joystick. -1..1, +y = forward. */
  input: {
    joyX: 0,
    joyY: 0,
    jump: false,
  },

  camera: {
    /** 'follow' orbits the player. */
    mode: 'follow',
    yaw: 0,
    pitch: 0.36,
    distance: 11,
    /** Set to jump the follow camera straight to its target next frame. */
    snap: false,
  },

  /** What the camera and the sun's shadow box follow instead of you, when set (cutscenes). */
  focus: null,

  /**
   * Other players' pets, written by the multiplayer layer: `{ id, position, yaw, hop }`
   * per pet. Drawn by the same instanced pet meshes as yours.
   */
  remotePets: [],

  /** Walls that come and go at runtime, e.g. locked Train Zones. */
  dynamicColliders: [],
  /** The gauntlet of the world you're in: its walls, and the cages still standing (cages/cageControl). */
  gauntletWalls: [],
  cageDoors: [],

  /**
   * Things that get a blob shadow on low presets. Each entry is
   * `{ position: Vector3, size: number, visible?: boolean }`.
   */
  shadowCasters: new Set(),
}

/** Puts the player back at spawn, e.g. after a reconnect into a fresh lobby. */
export function respawn() {
  runtime.player.position.set(SPAWN.x, 0, SPAWN.z)
  runtime.player.yaw = Math.PI
}
