import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

import { formatGain } from '@shared/format'

import { sfx } from '../../audio/sfx'
import { iconUrl } from '../../ui/icons'
import { push } from '../push/pushControl'
import { runtime } from '../runtime'
import { drainTrainFx } from './fxQueue'
import { spawnPopup, spawnScattered, updatePopups } from './popups'

const _at = new Vector3()
const MUSCLE_ICON = iconUrl('muscle')
const LEVEL_GRADIENT = 'linear-gradient(180deg, #e0faff 0%, #7fe2ff 45%, #2fa8ff 100%)'
/** A click's "+1": big, flexing, landing somewhere on screen, as in the reference. */
const LIFT_GAIN = { iconUrl: MUSCLE_ICON, scale: 1.6 }
const PUSH_GAIN = { iconUrl: MUSCLE_ICON }
const NEAR_GAIN = { iconUrl: MUSCLE_ICON }

/** One gain's popup: clicks over the screen, the rest by wherever you're drawn. */
function showGain(event) {
  const pushing = push.active
  const at = pushing ? push.position : runtime.player.position
  const follow = pushing ? push.position : null
  if (event.source === 'lift') {
    spawnScattered(`+${formatGain(event.gain)}`, LIFT_GAIN)
  } else if (pushing) {
    spawnScattered(`+${formatGain(event.gain)}`, PUSH_GAIN)
  } else {
    _at.set(at.x + (Math.random() - 0.5) * 3, at.y + 0.8 + Math.random() * 1.2, at.z + (Math.random() - 0.5) * 1.5)
    spawnPopup(`+${formatGain(event.gain)}`, _at, NEAR_GAIN)
  }
  sfx.gain(event.source !== 'lift')
  if (event.leveledUp) {
    _at.set(at.x, at.y + 2.8, at.z)
    spawnPopup(event.maxed ? 'MAX LEVEL!' : 'LEVEL UP!', _at, { gradient: LEVEL_GRADIENT, scale: 1.5, life: 1600, follow })
  }
}

/**
 * Muscle-gain feedback: a "+1" for every gain - a click, a lift in a Train Zone, a few
 * steps' walk, the "+1" ticks on the way up the mountain - and LEVEL UP! when one
 * lands. Also moves every live popup each frame.
 */
export function GainFX() {
  const size = useThree((s) => s.size)

  useFrame((state) => {
    drainTrainFx(showGain)
    updatePopups(state.camera, size.width, size.height)
  })

  return null
}

export default GainFX
