import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { feetPoint } from './push/path'
import { push } from './push/pushControl'
import { runtime } from './runtime'

/** How high above the player's feet the camera aims. */
const LOOK_HEIGHT = 1.6

const MIN_DISTANCE = 4
const MAX_DISTANCE = 26

// Pitch limits, in radians. Stops the camera flipping over the top or sinking
// under the ground.
const MIN_PITCH = -0.05
const MAX_PITCH = 1.2

const DRAG_SENSITIVITY = 0.005
const TOUCH_SENSITIVITY = 0.007
const ZOOM_SENSITIVITY = 0.012

// Higher = snappier. Framerate-independent via the exp() smoothing below.
const POSITION_SMOOTHING = 10
const LOOK_SMOOTHING = 14

const _desired = new Vector3()
const _target = new Vector3()
/** Where the camera is looking, eased towards its target (one camera, so module-level). */
const _lookAt = new Vector3()

/** Up the track: how far behind and above the pusher the chase camera rides. */
const CHASE_BEHIND = 7.5
const CHASE_HEIGHT = 4.6
/** It looks this far ahead of the pusher, over the boulder, up the track. */
const CHASE_AHEAD = 5
const CHASE_LOOK_HEIGHT = 2
const CHASE_SMOOTHING = 6

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Where the chase camera wants to be while pushing, and what it looks at: behind and
 * above you looking up the track over the boulder; pulled back and swung aside when it
 * crushes you; swung out to your side at the top, onto you cheering by your boulder
 * with THE TOP's trophy beyond.
 */
function chaseTarget(out, look) {
  const m = push.meter
  const x = push.x
  if (push.phase === 'top') {
    const k = smoothstep(0, 1.4, (performance.now() - push.endedAt) / 1000)
    feetPoint(m - CHASE_BEHIND * (1 - k) - 1.5 * k, x * 0.5 + 3 * k, out)
    out.y += CHASE_HEIGHT - 1.4 * k
    feetPoint(m + 3.5 * k, x, look)
    look.y += 1.8 + 0.8 * k
    return
  }
  const crushed = push.phase === 'crushed' ? smoothstep(0, 0.8, (performance.now() - push.endedAt) / 1000) : 0
  feetPoint(m - CHASE_BEHIND - 4 * crushed, x * 0.5 + 2.5 * crushed, out)
  out.y += CHASE_HEIGHT + 2.5 * crushed
  feetPoint(m + CHASE_AHEAD * (1 - crushed), x * 0.7, look)
  look.y += CHASE_LOOK_HEIGHT * (1 - crushed) + 0.6 * crushed
}

/**
 * Third-person orbit camera around the player.
 *
 * Mouse: drag (either button) orbits, wheel zooms. Touch: one-finger drag orbits (the
 * joystick owns the left side of the screen as a separate element), pinch zooms.
 *
 * Orbit state lives in `runtime.camera`, so after a push the camera can be handed back
 * exactly where it was taken from. While pushing it's a chase camera up the track
 * instead.
 */
export function FollowCamera() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const initialised = useRef(false)

  useEffect(() => {
    const el = gl.domElement
    if (!el) return undefined

    /** pointerId -> last { x, y } */
    const pointers = new Map()
    let pinchDistance = 0

    const orbit = runtime.camera

    const onPointerDown = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      el.setPointerCapture?.(e.pointerId)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }

    const onPointerMove = (e) => {
      const last = pointers.get(e.pointerId)
      if (!last) return

      if (pointers.size >= 2) {
        last.x = e.clientX
        last.y = e.clientY
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        orbit.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbit.distance - (d - pinchDistance) * 0.04))
        pinchDistance = d
        return
      }

      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      last.x = e.clientX
      last.y = e.clientY
      const sensitivity = e.pointerType === 'touch' ? TOUCH_SENSITIVITY : DRAG_SENSITIVITY
      orbit.yaw -= dx * sensitivity
      orbit.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, orbit.pitch + dy * sensitivity))
    }

    const endDrag = (e) => {
      pointers.delete(e.pointerId)
      el.releasePointerCapture?.(e.pointerId)
    }

    const onWheel = (e) => {
      // Without this the page scrolls behind the canvas.
      e.preventDefault()
      orbit.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, orbit.distance + e.deltaY * ZOOM_SENSITIVITY))
    }

    // Right-dragging otherwise opens the browser context menu mid-orbit.
    const onContextMenu = (e) => e.preventDefault()

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('contextmenu', onContextMenu)
    // passive:false is required for preventDefault() on wheel to take effect.
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('wheel', onWheel)
    }
  }, [gl])

  useFrame((_state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    if (runtime.camera.mode === 'push') {
      // Eased towards, so taking over from the orbit camera is a swoop, not a cut.
      chaseTarget(_desired, _target)
      const k = 1 - Math.exp(-CHASE_SMOOTHING * delta)
      camera.position.lerp(_desired, k)
      _lookAt.lerp(_target, k)
      camera.lookAt(_lookAt)
      return
    }
    // Whoever's being followed: you in the plaza, or up the mountain in a SAFEZONE.
    const p = runtime.focus ?? runtime.player.position
    _target.set(p.x, p.y + LOOK_HEIGHT, p.z)

    // Spherical -> cartesian. yaw 0 puts the camera south of the player, looking north.
    const { yaw, pitch, distance } = runtime.camera
    const horizontal = Math.cos(pitch) * distance
    _desired.set(
      _target.x + Math.sin(yaw) * horizontal,
      Math.max(_target.y + Math.sin(pitch) * distance, 0.6),
      _target.z + Math.cos(yaw) * horizontal,
    )

    // After a push the camera is far up the mountain; jump back rather than swoop.
    if (runtime.camera.snap) {
      runtime.camera.snap = false
      initialised.current = false
    }

    if (!initialised.current) {
      // Avoid a long swoop in from wherever the default camera started.
      camera.position.copy(_desired)
      _lookAt.copy(_target)
      initialised.current = true
    }

    camera.position.lerp(_desired, 1 - Math.exp(-POSITION_SMOOTHING * delta))
    _lookAt.lerp(_target, 1 - Math.exp(-LOOK_SMOOTHING * delta))
    camera.lookAt(_lookAt)
  })

  return null
}

export default FollowCamera
