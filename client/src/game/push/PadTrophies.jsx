import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CylinderGeometry, Matrix4, Quaternion, TorusGeometry, Vector3 } from 'three'

import { WIN_PAD } from '@shared/balance'

import { createToyInstances, PropBuilder } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { MAX_STAGES, WIN_PADS } from './course'
import { feetPoint } from './path'
import { push } from './pushControl'

/** Trophies are only drawn for pads this near where you are along the track. */
const NEAR = 160
const GOLD = '#ffc61a'

/** A gold cup about 1.1 tall, its foot at the origin: merged props in the toy look. */
function trophyGeometry() {
  const p = new PropBuilder()
  const parts = [
    [new CylinderGeometry(0.28, 0.32, 0.1, 16), { position: [0, 0.05, 0], color: '#5a3a14', style: STYLE.SMOOTH }],
    [new CylinderGeometry(0.2, 0.24, 0.08, 16), { position: [0, 0.14, 0], color: GOLD, style: STYLE.SMOOTH }],
    [new CylinderGeometry(0.05, 0.07, 0.32, 10), { position: [0, 0.34, 0], color: GOLD, style: STYLE.SMOOTH }],
    [new CylinderGeometry(0.34, 0.14, 0.42, 18), { position: [0, 0.71, 0], color: GOLD, style: STYLE.SMOOTH }],
    [new CylinderGeometry(0.36, 0.36, 0.05, 18), { position: [0, 0.94, 0], color: '#fff3a0', style: STYLE.GLOW }],
    [new CylinderGeometry(0.1, 0.1, 0.03, 5), { position: [0, 0.72, 0.27], rotation: [Math.PI / 2 - 0.4, 0, 0], color: '#fff3a0', style: STYLE.GLOW }],
  ]
  // Handles: half rings either side, opening towards the cup.
  for (const side of [-1, 1]) {
    parts.push([new TorusGeometry(0.15, 0.04, 6, 12, Math.PI), { position: [side * 0.3, 0.74, 0], rotation: [0, 0, -side * (Math.PI / 2)], color: GOLD, style: STYLE.SMOOTH }])
  }
  for (const [geometry, options] of parts) {
    p.add(geometry, options)
    geometry.dispose()
  }
  return p.build()
}

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _up = new Vector3(0, 1, 0)

/**
 * A gold trophy over every WINS pad in a SAFEZONE (THE TOP has its own), spinning and
 * bobbing so it catches the eye. One draw call for all of them, drawn only for the pads
 * near you.
 */
export default function PadTrophies() {
  const ref = useRef(null)
  const mesh = useMemo(() => createToyInstances(trophyGeometry(), sharedMaterials().toy, MAX_STAGES), [])

  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame((state) => {
    const trophies = ref.current
    if (!trophies) return
    const t = state.clock.elapsedTime
    const focus = push.active ? push.meter : 0
    const x = (WIN_PAD.minX + WIN_PAD.maxX) / 2
    let n = 0
    for (const pad of WIN_PADS) {
      if (!Number.isFinite(pad.end)) continue
      const meter = (pad.meter + pad.end) / 2
      if (Math.abs(meter - focus) > NEAR) continue
      feetPoint(meter, x, _p)
      _p.y += 0.3 + Math.sin(t * 2.2 + pad.stage) * 0.1
      _q.setFromAxisAngle(_up, t * 2)
      trophies.setMatrixAt(n, _m.compose(_p, _q, _s.setScalar(1.25)))
      n += 1
    }
    trophies.count = n
    trophies.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}
