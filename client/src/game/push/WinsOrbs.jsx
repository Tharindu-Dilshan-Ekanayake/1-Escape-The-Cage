import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three'

import { createToyInstances, PropBuilder } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { WINS_ORBS } from './course'
import { trackPoint } from './path'
import { ORB_HEIGHT, orbX, push } from './pushControl'

/** Orbs are drawn only this far up the track ahead of you (less from the lobby), and a little behind. */
const AHEAD = 110
const AHEAD_FROM_LOBBY = 30
const BEHIND = 1
/** The most drawn at once. */
const MAX_SHOWN = 36

/** A Wins orb about 1.5 across: a glowing gold ball in a bright ring, its middle at the origin. About 330 triangles. */
function orbGeometry() {
  const p = new PropBuilder()
  const parts = [
    [new SphereGeometry(0.5, 12, 8), { position: [0, 0, 0], color: '#ffc61a', style: STYLE.GLOW }],
    [new TorusGeometry(0.74, 0.05, 4, 18), { position: [0, 0, 0], rotation: [Math.PI / 2, 0, 0], color: '#fff3a0', style: STYLE.GLOW }],
  ]
  for (const [geometry, options] of parts) {
    p.add(geometry, options)
    geometry.dispose()
  }
  return p.build()
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3(1, 1, 1)

/**
 * The Wins orbs up the slopes near you, bobbing and turning, each gone once you've
 * taken it this climb (pushControl takes them). One draw call for all of them; from the
 * lobby, the first few up the track show.
 */
export default function WinsOrbs() {
  const ref = useRef(null)
  const mesh = useMemo(() => createToyInstances(orbGeometry(), sharedMaterials().toy, MAX_SHOWN), [])

  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame((state) => {
    const orbs = ref.current
    if (!orbs) return
    const t = state.clock.elapsedTime
    const focus = push.active ? push.meter : 0
    const ahead = push.active ? AHEAD : AHEAD_FROM_LOBBY
    const taken = push.active ? push.orbsTaken : null
    let n = 0
    // Bottom to top, so the first past AHEAD ends the search.
    for (const orb of WINS_ORBS) {
      if (orb.meter < focus - BEHIND || taken?.has(orb.index)) continue
      if (orb.meter > focus + ahead || n >= MAX_SHOWN) break
      trackPoint(orb.meter, orbX(orb), ORB_HEIGHT + Math.sin(t * 2.6 + orb.index) * 0.15, _p)
      _q.setFromEuler(_e.set(0.35, t * 1.8 + orb.index, 0))
      orbs.setMatrixAt(n, _m.compose(_p, _q, _s))
      n += 1
    }
    orbs.count = n
    orbs.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}
