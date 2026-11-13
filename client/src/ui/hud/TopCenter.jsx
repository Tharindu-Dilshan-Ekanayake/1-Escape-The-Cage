import { TUTORIAL } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { useClearTop } from '../../bloxity/reserved'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { u } from './style'

const BANNER_GRADIENT = 'linear-gradient(180deg, #fff6a8 0%, #ffd52a 45%, #ff9c00 100%)'

/**
 * What the guide tells a new player right now - its step, with the Strength to train up
 * to where it asks for some - until the guide's done; after that, nothing. (At a cage
 * the break bar says what to do; max level has its own call to rebirth, up top:
 * RebirthNotice.)
 */
function useHint() {
  const step = useGame((s) => s.profile.tutorialStep)
  const muscle = useGame((s) => Math.floor(s.profile.muscle))
  const atCage = useGame((s) => s.zone.cage >= 0)
  const current = TUTORIAL[step]
  if (!current || atCage) return null
  if (current.muscle && muscle < current.muscle) return { key: current.text, text: `${current.text} ${formatNumber(muscle)}/${current.muscle}` }
  return { key: current.text, text: current.text }
}

/**
 * The big hint under the level bar, as in the reference. A tutorial step stays up until
 * it's done; any other hint shows for about three seconds and fades (pp-hint), so it's
 * never in the way of playing. Keyed on the hint, so a new one starts it again. Paused
 * while the HUD is out of sight (a panel open), so a hint is never used up
 * unseen.
 */
export function TopCenter() {
  const hint = useHint()
  const hidden = useGame((s) => s.panel !== null)
  // As high up as it can go: the widest middle band that Boxity's toolbar and chat leave
  // clearest (on a sideways phone, a narrower one beside the chat rather than below it).
  const bands = [
    [0.66, useClearTop(0.17, 0.83)],
    [0.5, useClearTop(0.25, 0.75)],
    [0.34, useClearTop(0.33, 0.67)],
  ]
  const least = Math.min(...bands.map(([, c]) => c))
  const [width, clear] = bands.find(([, c]) => c === least)
  if (!hint) return null

  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: `max(${u(196)}, ${clear + 8}px)` }}>
      <div key={hint.key} className="pp-pet text-center" style={{ fontSize: u(60), maxWidth: `min(${width * 100}vw, max(${u(420)}, calc(100vw - ${u(680)})))`, animationPlayState: hidden ? 'paused' : 'running' }}>
        <StrokeText stroke={u(12)} gradient={BANNER_GRADIENT} style={{ whiteSpace: 'normal' }}>
          {hint.text}
        </StrokeText>
      </div>
    </div>
  )
}

export default TopCenter
