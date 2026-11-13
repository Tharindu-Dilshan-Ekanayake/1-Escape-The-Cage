import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Matrix4, Quaternion, Vector3 } from 'three'


import { getQuality } from '../../store/quality'
import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { STAGES } from './course'
import { boulderRadius, tiltAt } from './path'
import { push } from './pushControl'
import { STAGE_THEMES } from './themes'

/** Dust pieces in flight at once. */
const DUST = 64
const GRAVITY = 9

/** Up the track and out of its floor where the boulder is: tipped on a slope, level on a flat. */
const _upTrack = new Vector3()
const _normal = new Vector3()
const WHITE = new Color('#ffffff')
/** What the boulder kicks up on each stage: its floor, lightened. */
/** Each stage's dust: its floor's colour, paled. By stage id, made as they're first needed. */
const dustColors = new Map()
function dustColor(id) {
  if (!dustColors.has(id)) dustColors.set(id, new Color(STAGE_THEMES[id]?.floor ?? '#ffffff').lerp(WHITE, 0.45))
  return dustColors.get(id)
}

const _m = new Matrix4()
const _q = new Quaternion()
const _s = new Vector3()

const dust = Array.from({ length: DUST }, () => ({ life: 0, max: 1, size: 0.2, pos: new Vector3(), vel: new Vector3() }))

/**
 * Throws `count` dust pieces from where the boulder meets the floor, out to the sides
 * and back down the slope. `st.next` is the pool's write head.
 */
function emit(pieces, st, count, spread, lift) {
  const color = STAGES[push.stage] ? dustColor(STAGES[push.stage].id) : WHITE
  const r = boulderRadius(push.stage)
  const t = tiltAt(push.boulderMeter)
  _upTrack.set(0, Math.sin(t), -Math.cos(t))
  _normal.set(0, Math.cos(t), Math.sin(t))
  for (let i = 0; i < count; i += 1) {
    const p = dust[st.next]
    pieces.setColorAt(st.next, color)
    st.next = (st.next + 1) % DUST
    const side = (Math.random() - 0.5) * 2
    p.pos.copy(push.boulderPosition).addScaledVector(_normal, -r + 0.15).addScaledVector(_upTrack, -r * 0.6)
    p.pos.x += side * r * 0.7
    p.vel.copy(_upTrack).multiplyScalar(-(0.5 + Math.random()) * 1.5)
    p.vel.x += side * spread * (0.6 + Math.random() * 0.8)
    p.vel.addScaledVector(_normal, lift * (0.5 + Math.random()))
    p.max = 0.5 + Math.random() * 0.45
    p.life = p.max
    p.size = 0.16 + Math.random() * 0.22
  }
  if (pieces.instanceColor) pieces.instanceColor.needsUpdate = true
}

/**
 * The push's dust, on presets with particles: grit spraying from under the boulder as it
 * rolls (either way), a cloud when it crushes you. A fixed pool, one draw call, nothing
 * drawn when nothing's alive.
 */
export function PushFX() {
  const ref = useRef(null)
  const state = useRef({ next: 0, owed: 0, crushSeen: 0 })

  const pieces = useMemo(() => {
    const mesh = createBoxInstances(DUST, sharedMaterials().toy, STYLE.SMOOTH)
    mesh.count = DUST
    mesh.visible = false
    return mesh
  }, [])

  useEffect(
    () => () => {
      for (const p of dust) p.life = 0
      disposeBlocks(pieces)
    },
    [pieces],
  )

  useFrame((_frame, rawDelta) => {
    const mesh = ref.current
    if (!mesh) return
    const delta = Math.min(rawDelta, 0.05)
    const on = getQuality().particles
    const st = state.current

    if (push.active && on) {
      const speed = Math.abs(push.speed)
      if (speed > 0.6 && push.phase === 'push') {
        st.owed += delta * Math.min(30, 4 + speed * 3)
        const n = Math.floor(st.owed)
        st.owed -= n
        if (n > 0) emit(mesh, st, n, 1.4, 1.6)
      }
      if (push.phase === 'crushed' && st.crushSeen !== push.crushedAt) {
        st.crushSeen = push.crushedAt
        emit(mesh, st, 40, 4, 3.5)
      }
    } else if (!push.active) {
      st.owed = 0
    }

    let alive = false
    for (let i = 0; i < DUST; i += 1) {
      const p = dust[i]
      if (p.life <= 0) continue
      p.life -= delta
      alive = true
      if (p.life <= 0 || !on) {
        p.life = 0
        mesh.setMatrixAt(i, _m.makeScale(0, 0, 0))
        continue
      }
      p.vel.y -= GRAVITY * delta
      p.vel.multiplyScalar(1 - delta * 2.5)
      p.pos.addScaledVector(p.vel, delta)
      _s.setScalar(p.size * (p.life / p.max))
      mesh.setMatrixAt(i, _m.compose(p.pos, _q, _s))
    }
    mesh.visible = alive
    if (alive) mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={pieces} />
}

export default PushFX
