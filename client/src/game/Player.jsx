import { useFrame } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Quaternion, Vector3 } from 'three'

import { walkSpeed } from '@shared/balance'
import { isZoneUnlocked } from '@shared/logic'
import {
  BENCH_X,
  benchAt,
  benchSeatZ,
  clampToWalkable,
  groundHeightAt,
  SEAT_YAW,
  STATIC_COLLIDERS,
  ZONE_HEIGHT,
  zoneAt,
} from '@shared/world'

import { sfx } from '../audio/sfx'
import { prefetchLook } from '../bloxity/avatarLoader'
import { useBloxity } from '../bloxity/BloxityContext'
import { getGame } from '../store/game'
import ErrorBoundary from '../ui/ErrorBoundary'
import { createHeldDumbbell, disposeDumbbellMesh } from './dumbbell'
import FallbackAvatar from './FallbackAvatar'
import PlayerAvatar, { AvatarShaderWarmup } from './PlayerAvatar'
import { bulkFor, growBody } from './playerPose'
import { emoteMotion, stopEmote } from './emotes'
import { advancePush, push, walkSafezone } from './push/pushControl'
import { runtime } from './runtime'
import useKeyboard from './useKeyboard'

export const PLAYER_HEIGHT = 1.8
const RADIUS = 0.45

const ACCELERATION = 16
const GRAVITY = 32
const JUMP_SPEED = 10.5
/** Ledges up to this high are walked straight onto (the shop's back stage). */
const STEP_UP = 1.05
/** A click's curl takes this long. */
const CURL_MS = 380
/** Facing up the track, at the boulder; at the top, turned to the camera at your side. */
const UPHILL_YAW = Math.PI
const CHEER_YAW = Math.PI / 2
/** At the top, the cheer comes in over this long. */
const CHEER_IN = 0.5
/** The win dance lasts this long, unless you move off sooner. */
const DANCE_MS = 4500

// Scratch objects, reused each frame so the loop allocates nothing.
const _input = new Vector3()
const _move = new Vector3()
const _camForward = new Vector3()
const _camRight = new Vector3()
const _targetQuat = new Quaternion()
const _up = new Vector3(0, 1, 0)
const _clamped = { x: 0, z: 0 }
/** Push input, handed to the push each frame. */
const pushInput = { forward: 0, back: 0, side: 0 }

/** Pushes a circle out of an axis-aligned rect. Returns true on contact. */
function pushOut(pos, rect) {
  const cx = Math.min(rect.maxX, Math.max(rect.minX, pos.x))
  const cz = Math.min(rect.maxZ, Math.max(rect.minZ, pos.z))
  const dx = pos.x - cx
  const dz = pos.z - cz
  const d2 = dx * dx + dz * dz
  if (d2 >= RADIUS * RADIUS) return false

  if (d2 > 1e-8) {
    const d = Math.sqrt(d2)
    const shove = (RADIUS - d) / d
    pos.x += dx * shove
    pos.z += dz * shove
    return true
  }

  // Centre inside the rect (spawned in, or a wall appeared on top of us): leave by the
  // nearest side.
  const left = pos.x - rect.minX
  const right = rect.maxX - pos.x
  const near = pos.z - rect.minZ
  const far = rect.maxZ - pos.z
  const m = Math.min(left, right, near, far)
  if (m === left) pos.x = rect.minX - RADIUS
  else if (m === right) pos.x = rect.maxX + RADIUS
  else if (m === near) pos.z = rect.minZ - RADIUS
  else pos.z = rect.maxZ + RADIUS
  return true
}

/**
 * The local player: a kinematic character controller.
 *
 * No physics engine: the plaza is flat ground, a few raised floors and a list of
 * rectangular walls, which a circle-vs-rect push-out handles exactly. That saves the
 * ~2 MB Rapier WASM download and keeps the active rigid body count at zero.
 *
 * In the plaza you walk and curl your dumbbell when you click. Step onto a Train Zone's
 * pad and you walk yourself to its long bench, sit and curl on a loop, until you move
 * or jump (walking into the bench sits you too). Up the mountain
 * you push a boulder - forward drives it, sideways steers -
 * and between pushes you walk about the SAFEZONE you've reached, just as in the plaza.
 * Your logical position stays on the PUSH ZONE all the while (it's what the server
 * checks); only the drawn character climbs the mountain.
 *
 * Reads and writes `runtime.player`; never touches React state per frame.
 *
 * @param {{ onAvatarReady?: () => void }} props
 */
export function Player({ onAvatarReady }) {
  const { avatar } = useBloxity()
  // Your clothes start downloading now, not once the body has.
  useEffect(() => prefetchLook(avatar), [avatar])
  const [avatarIn, setAvatarIn] = useState(false)
  const handleAvatarReady = useCallback(() => {
    setAvatarIn(true)
    onAvatarReady?.()
  }, [onAvatarReady])
  const groupRef = useRef(null)
  const visualRef = useRef(null)
  const handRef = useRef(null)
  const heldRef = useRef(null)
  const keys = useKeyboard()
  const velocity = useRef(new Vector3())
  const vy = useRef(0)
  const wasPushing = useRef(false)
  const dumbbell = useMemo(() => createHeldDumbbell(), [])

  /** Handed to the avatar so it can pose itself. A ref: written every frame. */
  const motionRef = useRef({
    time: 0,
    speed: 0,
    grounded: true,
    maxSpeed: walkSpeed(),
    vy: 0,
    stride: 0,
    pushing: false,
    effort: 0,
    strain: 0,
    crushed: 0,
    cheer: 0,
    curl: 0,
    training: false,
    sitting: false,
    dance: 0,
    bulk: -1,
  })
  /** The Train Zone whose bench you're sat on, or -1, and where along it. */
  const seated = useRef(-1)
  const seatedZ = useRef(0)
  /** The bench you just got up from: you don't sit back down until you've stepped off it. */
  const leftSeat = useRef(-1)
  /** Still holding the move you walked onto the bench with: that one doesn't get you up. */
  const sitHeld = useRef(false)
  /** The Train Zone whose pad you're on (-1 off them), and whose bench you're walking to. */
  const onPad = useRef(-1)
  const toBench = useRef(-1)
  /** Still holding the move you stepped onto the pad with: that one doesn't stop the walk. */
  const padHeld = useRef(false)

  // The blob shadow follows what's drawn, which is up the track while you push.
  const shownAt = useMemo(() => new Vector3().copy(runtime.player.position), [])
  useEffect(() => {
    const caster = { position: shownAt, size: 1.1 }
    runtime.shadowCasters.add(caster)
    return () => runtime.shadowCasters.delete(caster)
  }, [shownAt])

  useEffect(() => () => disposeDumbbellMesh(dumbbell), [dumbbell])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const player = runtime.player
    const pos = player.position
    const k = keys.current
    const joy = runtime.input
    const motion = motionRef.current
    const profile = getGame().profile
    motion.time += delta
    growBody(motion, bulkFor(profile.muscle), delta)

    const group = groupRef.current
    const visual = visualRef.current
    const held = heldRef.current
    held?.setDumbbell(profile.equippedDumbbell)

    // --- Pushing a boulder --------------------------------------------------------
    const free = push.active && push.phase === 'free'
    if (push.active && !free && group && visual) {
      pushInput.forward = Math.max(k.forward ? 1 : 0, joy.joyY > 0.2 ? Math.min(1, joy.joyY * 1.3) : 0)
      pushInput.back = Math.max(k.backward ? 1 : 0, joy.joyY < -0.35 ? 1 : 0)
      pushInput.side = Math.max(-1, Math.min(1, (k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX))
      advancePush(delta, pushInput)
      if (!push.active) return
      if (!wasPushing.current) {
        wasPushing.current = true
        velocity.current.set(0, 0, 0)
        vy.current = 0
        visual.quaternion.setFromAxisAngle(_up, UPHILL_YAW)
      }
      player.anim = 'push'
      player.speed = 0
      group.position.copy(push.position)
      _targetQuat.setFromAxisAngle(_up, push.phase === 'top' ? CHEER_YAW : UPHILL_YAW)
      visual.quaternion.slerp(_targetQuat, 1 - Math.pow(0.001, delta))
      // Crushed: squashed flat under the boulder as it rolls over you.
      const c = push.phase === 'crushed' ? Math.min(1, Math.max(0, (push.crush - 0.45) / 0.3)) : 0
      group.scale.set(1 + 0.35 * c, 1 - 0.88 * c, 1 + 0.35 * c)
      shownAt.copy(push.position)
      if (held) held.visible = false
      motion.pushing = true
      motion.speed = push.speed
      motion.maxSpeed = 6.5
      motion.effort = push.effort
      motion.strain = push.strain
      motion.crushed = c
      motion.cheer = push.phase === 'top' ? Math.min(1, motion.cheer + delta / CHEER_IN) : 0
      motion.grounded = true
      motion.training = false
      motion.curl = 0
      motion.stride += delta * (4 + 5 * Math.min(1, Math.abs(push.speed) / 6.5))
      if (player.emote) stopEmote()
      motion.emoteClip = null
      return
    }
    if (wasPushing.current && group && visual) {
      // Off the boulder: back in the plaza, or free in a SAFEZONE facing on up.
      wasPushing.current = false
      velocity.current.set(0, 0, 0)
      vy.current = 0
      if (free) player.yaw = UPHILL_YAW
      group.position.copy(free ? push.position : pos)
      group.scale.set(1, 1, 1)
      visual.quaternion.setFromAxisAngle(_up, player.yaw)
      motion.pushing = false
      motion.crushed = 0
      motion.cheer = 0
      motion.strain = 0
    }
    if (held) held.visible = true

    // Walking: in the plaza, or about a SAFEZONE (where the plaza position stays put).
    const at = free ? push.position : pos
    const locked = !free && player.frozen
    const moving = (k.forward || k.backward || k.left || k.right || Math.hypot(joy.joyX, joy.joyY) > 0.02) && !locked

    // --- On a bench: sat still, training, until you move (a fresh press) or jump -------
    if (!moving) sitHeld.current = false
    const getUp = (moving && !sitHeld.current) || k.jump || joy.jump
    if (seated.current >= 0 && (free || getUp || !isZoneUnlocked(profile, seated.current))) {
      leftSeat.current = seated.current
      seated.current = -1
    }
    if (seated.current >= 0) {
      at.set(BENCH_X, ZONE_HEIGHT, seatedZ.current)
      velocity.current.set(0, 0, 0)
      vy.current = 0
      player.grounded = true
      player.yaw = SEAT_YAW
      if (visual) visual.quaternion.slerp(_targetQuat.setFromAxisAngle(_up, SEAT_YAW), 1 - Math.pow(0.0005, delta))
      if (group) group.position.copy(at)
      shownAt.copy(at)
      player.bench = seated.current
      player.speed = 0
      player.anim = 'train'
      motion.speed = 0
      motion.grounded = true
      motion.vy = 0
      motion.sitting = true
      motion.training = true
      motion.curl = 0
      if (player.emote) stopEmote()
      motion.emoteClip = null
      return
    }
    player.bench = -1
    motion.sitting = false

    // --- Input, relative to the camera ----------------------------------------
    const maxSpeed = walkSpeed(profile.level, profile.rebirths)
    _input.set(0, 0, 0)
    if (!locked) {
      _input.set(
        (k.right ? 1 : 0) - (k.left ? 1 : 0) + joy.joyX,
        0,
        (k.backward ? 1 : 0) - (k.forward ? 1 : 0) - joy.joyY,
      )
    }
    const inputLength = Math.min(1, _input.length())

    // Just stepped onto an unlocked Train Zone's pad: off to its bench, until a fresh
    // move or a jump takes over (or you leave the pad).
    const pad = free || locked ? -1 : zoneAt(at.x, at.z)
    if (pad !== onPad.current) {
      onPad.current = pad
      toBench.current = pad >= 0 && isZoneUnlocked(profile, pad) ? pad : -1
      padHeld.current = moving
    }
    if (!moving) padHeld.current = false
    if (toBench.current >= 0 && ((moving && !padHeld.current) || k.jump || joy.jump)) toBench.current = -1

    if (toBench.current >= 0) {
      _move.set(BENCH_X - at.x, 0, benchSeatZ(toBench.current, at.z) - at.z)
      if (_move.lengthSq() > 1e-4) _move.normalize().multiplyScalar(maxSpeed * 0.75)
    } else if (inputLength > 0.02) {
      _input.normalize()
      // Flatten the camera's forward onto the ground plane so "up" always means
      // "away from the camera".
      state.camera.getWorldDirection(_camForward)
      _camForward.y = 0
      _camForward.normalize()
      _camRight.crossVectors(_camForward, _up).normalize()
      _move
        .set(0, 0, 0)
        .addScaledVector(_camForward, -_input.z)
        .addScaledVector(_camRight, _input.x)
        .normalize()
        .multiplyScalar(maxSpeed * inputLength)
    } else {
      _move.set(0, 0, 0)
    }

    // Ease towards the target velocity: crisp, but no instant 0->max snaps.
    const blend = 1 - Math.exp(-ACCELERATION * delta)
    velocity.current.lerp(_move, blend)

    // --- Horizontal move + collision --------------------------------------------
    const prevX = at.x
    const prevZ = at.z
    at.x += velocity.current.x * delta
    at.z += velocity.current.z * delta

    let floor
    if (free) {
      floor = walkSafezone(at)
    } else {
      for (const rect of STATIC_COLLIDERS) pushOut(at, rect)
      for (const rect of runtime.dynamicColliders) pushOut(at, rect)
      clampToWalkable(at.x, at.z, _clamped)
      at.x = _clamped.x
      at.z = _clamped.z

      // A ledge too tall to step onto acts as a wall.
      floor = groundHeightAt(at.x, at.z)
      if (floor - at.y > STEP_UP) {
        at.x = prevX
        at.z = prevZ
        floor = groundHeightAt(at.x, at.z)
      }
    }

    // --- Vertical ---------------------------------------------------------------
    const wantJump = !locked && (k.jump || joy.jump)
    if (wantJump && player.grounded) {
      vy.current = JUMP_SPEED
      player.grounded = false
      sfx.jump()
    }
    vy.current -= GRAVITY * delta
    at.y += vy.current * delta

    if (at.y <= floor) {
      // Coming down from a jump (not just stepping off a kerb) lands with a thump.
      if (!player.grounded && vy.current < -5) sfx.jumpLand()
      at.y = floor
      vy.current = 0
      player.grounded = true
    } else if (at.y - floor > 0.05) {
      // Walked off a ledge, or still rising from a jump.
      player.grounded = false
    }

    // --- Facing -----------------------------------------------------------------
    const speed = Math.hypot(velocity.current.x, velocity.current.z)
    if (speed > 0.3) player.yaw = Math.atan2(velocity.current.x, velocity.current.z)
    if (visual) {
      _targetQuat.setFromAxisAngle(_up, player.yaw)
      visual.quaternion.slerp(_targetQuat, 1 - Math.pow(0.0005, delta))
    }
    if (group) {
      // Step-ups ease in over a few frames on the visual only; the logical position
      // snaps so collision and triggers stay exact.
      const steppingUp = player.grounded && at.y > group.position.y
      const visualY = steppingUp
        ? group.position.y + (at.y - group.position.y) * Math.min(1, delta * 18)
        : at.y
      group.position.set(at.x, visualY, at.z)
    }
    shownAt.copy(at)

    // Walked into a bench in an unlocked Train Zone: sit on it there (from next frame).
    // Off the bench you got up from (jumping off it doesn't count), you may sit again.
    const bench = free || locked ? -1 : benchAt(at.x, at.z)
    if (bench !== leftSeat.current) leftSeat.current = -1
    if (bench >= 0 && player.grounded && bench !== leftSeat.current && isZoneUnlocked(profile, bench)) {
      seated.current = bench
      seatedZ.current = benchSeatZ(bench, at.z)
      sitHeld.current = moving
      toBench.current = -1
    }

    // Back from a win: dancing on the spot until it's over or you move off.
    if (player.danceAt && (free || moving || !player.grounded || performance.now() - player.danceAt > DANCE_MS)) player.danceAt = 0
    const dancing = player.danceAt > 0

    // --- Publish motion ---------------------------------------------------------
    // Up the mountain, others see you from where you are there, not in the plaza.
    player.speed = free ? 0 : speed
    player.anim = free ? 'push' : !player.grounded ? 'jump' : dancing ? 'dance' : speed > 0.5 ? 'walk' : 'idle'

    const sinceLift = performance.now() - player.liftedAt
    motion.speed = speed
    motion.maxSpeed = maxSpeed
    motion.grounded = player.grounded
    motion.vy = vy.current
    motion.training = false
    motion.dance = dancing ? 1 : 0
    motion.curl = sinceLift < CURL_MS ? sinceLift / CURL_MS : 0
    // Steps quicken with speed: the stride phase runs faster rather than jumping.
    motion.stride += delta * (5 + 6 * Math.min(1, speed / maxSpeed))

    // A Boxity emote plays while you stand; moving, jumping, dancing or climbing stops it.
    const emote = player.emote
    if (emote && (free || moving || !player.grounded || dancing || !emoteMotion(motion, emote.id, emote.at))) stopEmote()
    if (!player.emote) motion.emoteClip = null
  })

  return (
    <group ref={groupRef}>
      <group ref={visualRef}>
        {/* The loading screen waits for your Bloxity avatar; only if it can't be had in
            time (or at all) does the blocky stand-in show in its place. */}
        {!avatarIn && <FallbackAvatar motionRef={motionRef} handRef={handRef} />}
        <AvatarShaderWarmup />
        <ErrorBoundary fallback={<FallbackAvatar motionRef={motionRef} handRef={handRef} onReady={handleAvatarReady} />}>
          <Suspense fallback={null}>
            <PlayerAvatar onReady={handleAvatarReady} targetHeight={PLAYER_HEIGHT} motionRef={motionRef} handRef={handRef} />
          </Suspense>
        </ErrorBoundary>
        <group ref={handRef}>
          <primitive ref={heldRef} object={dumbbell} />
        </group>
      </group>
    </group>
  )
}

export default Player
