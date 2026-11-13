import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Matrix4, Quaternion, Vector3 } from 'three'

import { PUSH_START } from '@shared/balance'

import { remotePlayers } from '../../net/remotePlayers'
import { getQuality } from '../../store/quality'
import { runtime } from '../runtime'
import { createBoulderMesh, disposeBoulderMesh } from './boulder'
import { MAX_STAGES, STAGES, stageStart } from './course'
import { boulderGap, boulderRadius, trackPoint } from './path'
import { push } from './pushControl'
import { stepRemotePushers } from './remotePush'

const MAX_REMOTES = 8
/** Each stage's, waiting at the foot of its slope; yours; and everyone else's. */
const MAX_BOULDERS = MAX_STAGES + 1 + MAX_REMOTES

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _x = new Vector3(1, 0, 0)

/** Rolling up the track turns a boulder about the track's cross axis. */
const rolled = (roll) => _q.setFromAxisAngle(_x, -roll)

/** A blob shadow under each boulder (on presets without realtime shadows). One Boulders exists. */
const casters = Array.from({ length: MAX_BOULDERS }, () => ({ position: new Vector3(), size: 3.6, visible: false }))

/** Draws boulder `i` (stage `stage`'s, turned `roll`) at `position`, with its shadow; returns the next index. */
function placeBoulder(boulders, i, position, roll, stage) {
  const r = boulderRadius(stage)
  boulders.setMatrixAt(i, _m.compose(position, rolled(roll), _s.setScalar(r)))
  boulders.setStage(i, stage)
  const caster = casters[i]
  caster.position.copy(position)
  caster.size = r * 1.7
  caster.visible = true
  return i + 1
}

/** Where stage `stage`'s boulder waits: just up from where you stand to take it. */
const waitingMeter = (stage) => stageStart(stage) + PUSH_START + boulderGap(stage)

/**
 * Every boulder in the world, in one draw call: each stage's waiting at the foot of its
 * slope (the first in the plaza, the rest at the top of each SAFEZONE) - except the one
 * you're pushing, which goes up the slope with you - and everyone else's, eased along
 * from what they report. Waiting ones past the view distance aren't drawn. Each gets a
 * blob shadow on presets without realtime ones.
 */
export function Boulders() {
  const ref = useRef(null)
  const mesh = useMemo(() => createBoulderMesh(MAX_BOULDERS), [])

  useEffect(() => {
    for (const caster of casters) runtime.shadowCasters.add(caster)
    return () => {
      for (const caster of casters) runtime.shadowCasters.delete(caster)
      disposeBoulderMesh(mesh)
    }
  }, [mesh])

  useFrame((state, rawDelta) => {
    const boulders = ref.current
    if (!boulders) return
    const delta = Math.min(rawDelta, 0.05)
    stepRemotePushers(remotePlayers, state.clock.elapsedTime, delta)
    const far = getQuality().viewDistance
    const pushing = push.active && push.phase !== 'free'
    let i = 0

    for (let stage = 0; stage < STAGES.length; stage += 1) {
      if (pushing && push.stage === stage) {
        i = placeBoulder(boulders, i, push.boulderPosition, push.roll, stage)
        continue
      }
      trackPoint(waitingMeter(stage), 0, boulderRadius(stage), _p)
      if (_p.distanceTo(state.camera.position) < far) i = placeBoulder(boulders, i, _p, 0, stage)
    }

    for (const r of remotePlayers.values()) {
      if (!r.pushing || r.pushPhase !== 'push' || i >= MAX_BOULDERS) continue
      const stage = r.pushStage ?? 0
      i = placeBoulder(boulders, i, trackPoint(r.shownMeter + boulderGap(stage), r.shownX, boulderRadius(stage), _p), r.roll, stage)
    }

    for (let j = i; j < MAX_BOULDERS; j += 1) casters[j].visible = false
    boulders.count = i
    boulders.instanceMatrix.needsUpdate = true
  })

  return <primitive ref={ref} object={mesh} />
}

export default Boulders
