import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'

import { walkSpeed } from '@shared/balance'

import { remotePlayers } from '../../net/remotePlayers'
import { createHeldDumbbell, disposeDumbbellMesh } from '../dumbbell'
import { BloxityAvatar } from '../PlayerAvatar'
import { emoteMotion } from '../emotes'
import { bulkFor, growBody } from '../playerPose'
import { stepRemotePushers } from '../push/remotePush'

/** How often the set of players is checked for comings, goings and outfit changes. */
const PICK_MS = 500
/** The most other players drawn (a room holds 8). */
const MAX_SHOWN = 12
/** Past these distances a player is posed every 2nd, then every 4th frame. */
const POSE_HALF = 30
const POSE_QUARTER = 60
/** Top walking speed: full stride amplitude, as for your own character. */
const MAX_SPEED = walkSpeed()
/** Facing up the track, at the boulder. */
const UPHILL_YAW = Math.PI
/** A lift's curl takes this long, as for your own character. */
const CURL_MS = 380

const _up = new Vector3(0, 1, 0)

/**
 * One other player as their real Bloxity avatar, dressed as they are, holding their
 * dumbbell and posed by the same playerPose as yours, from what the network says
 * they're doing: walking pace, curling in a Train Zone or after a lift, jumping - and up
 * the mountain, pushing their boulder (Boulders draws it) or walking a SAFEZONE.
 */
function RemoteAvatar({ sessionId, look }) {
  const groupRef = useRef(null)
  const handRef = useRef(null)
  const heldRef = useRef(null)
  const lastY = useRef(null)
  const dumbbell = useMemo(() => createHeldDumbbell(), [])
  const motionRef = useRef({ time: 0, speed: 0, grounded: true, maxSpeed: MAX_SPEED, vy: 0, stride: 0, pushing: false, effort: 0, curl: 0, training: false })

  useEffect(() => () => disposeDumbbellMesh(dumbbell), [dumbbell])

  useFrame((state, rawDelta) => {
    const group = groupRef.current
    const r = remotePlayers.get(sessionId)
    if (!group || !r) return
    const delta = Math.min(rawDelta, 0.05)
    stepRemotePushers(remotePlayers, state.clock.elapsedTime, delta)
    const m = motionRef.current
    const far = state.camera.position.distanceTo(group.position)
    m.poseEvery = far > POSE_QUARTER ? 4 : far > POSE_HALF ? 2 : 1
    m.time += delta
    growBody(m, bulkFor(r.muscle), delta)
    const held = heldRef.current
    held?.setDumbbell(r.dumbbellId)

    // Walking about a SAFEZONE, up the mountain.
    if (r.pushing && r.pushPhase === 'free') {
      group.visible = true
      group.position.copy(r.shownAt)
      group.quaternion.setFromAxisAngle(_up, r.climbYaw)
      if (held) held.visible = true
      m.pushing = false
      m.speed = r.climbSpeed
      m.maxSpeed = MAX_SPEED
      m.grounded = true
      m.training = false
      const sinceLift = performance.now() - r.liftedAt
      m.curl = sinceLift < CURL_MS ? sinceLift / CURL_MS : 0
      m.stride += delta * (5 + 6 * Math.min(1, r.climbSpeed / MAX_SPEED))
      m.emoteClip = null
      lastY.current = null
      return
    }

    // Pushing: behind their boulder, up the track.
    if (r.pushing) {
      group.visible = true
      group.position.copy(r.shownAt)
      group.quaternion.setFromAxisAngle(_up, UPHILL_YAW)
      if (held) held.visible = false
      m.pushing = true
      m.speed = r.pushSpeed
      m.maxSpeed = 6.5
      m.effort = r.pushSpeed > 0.2 ? 1 : 0.4
      m.grounded = true
      m.training = false
      m.curl = 0
      m.stride += delta * (4 + 5 * Math.min(1, Math.abs(r.pushSpeed) / 6.5))
      m.emoteClip = null
      lastY.current = null
      return
    }
    m.pushing = false
    if (held) held.visible = true

    // Mid-push but we never saw it start (we joined late): not drawn at the bottom.
    group.visible = r.anim !== 'push'
    group.position.copy(r.position)
    group.quaternion.setFromAxisAngle(_up, r.yaw)

    m.speed = r.speed
    m.maxSpeed = MAX_SPEED
    m.grounded = r.anim !== 'jump'
    m.training = r.anim === 'train'
    m.sitting = m.training
    m.dance = r.anim === 'dance' ? 1 : 0
    const sinceLift = performance.now() - r.liftedAt
    m.curl = sinceLift < CURL_MS ? sinceLift / CURL_MS : 0
    // Vertical speed from the interpolated height, smoothed: rising vs falling.
    const y = r.position.y
    if (lastY.current !== null) m.vy += ((y - lastY.current) / Math.max(delta, 1e-3) - m.vy) * 0.3
    lastY.current = y
    m.stride += delta * (5 + 6 * Math.min(1, r.speed / MAX_SPEED))
    // Their Boxity emote, while they stand still.
    if (!r.emote || r.speed > 0.6 || !m.grounded || m.training || !emoteMotion(m, r.emote, r.emoteStart)) m.emoteClip = null
  })

  return (
    <group ref={groupRef}>
      <BloxityAvatar equipped={look?.equipped} proportions={look?.proportions} motionRef={motionRef} handRef={handRef} targetHeight={1.8} />
      <group ref={handRef}>
        <primitive ref={heldRef} object={dumbbell} />
      </group>
    </group>
  )
}

/**
 * Every other player as their real Bloxity avatar, dressed as they are - standing,
 * walking, training or pushing, however far away (the far ones just posed less often).
 * Each shows once it's dressed; until then, nothing - never a stand-in. Checked twice a
 * second, never per frame, so React only re-renders when the set of players (or an
 * outfit) actually changes.
 */
export function RemoteAvatars() {
  const [shown, setShown] = useState([])

  useEffect(() => {
    const pick = () => {
      const next = [...remotePlayers.values()].sort((a, b) => (a.sessionId < b.sessionId ? -1 : 1)).slice(0, MAX_SHOWN)
      setShown((prev) => {
        const same = prev.length === next.length && prev.every((p, i) => p.sessionId === next[i].sessionId && p.lookKey === next[i].lookKey)
        return same ? prev : next.map((r) => ({ sessionId: r.sessionId, look: r.look, lookKey: r.lookKey }))
      })
    }
    pick()
    const id = setInterval(pick, PICK_MS)
    return () => clearInterval(id)
  }, [])

  return shown.map((s) => (
    <Suspense key={`${s.sessionId}:${s.lookKey}`} fallback={null}>
      <RemoteAvatar sessionId={s.sessionId} look={s.look} />
    </Suspense>
  ))
}

export default RemoteAvatars
