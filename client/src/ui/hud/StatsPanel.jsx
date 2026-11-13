import { formatClock, formatNumber } from '@shared/format'

import { useGame } from '../../store/game'
import useNow from '../useNow'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

/** Rebirths' colours: the pink and ice-blue of their arrows. */
const REBIRTH_GRADIENT = 'linear-gradient(180deg, #ffe0f6 0%, #ff7ad9 50%, #7fd8ff 100%)'

/** One stat: its icon and number. `small` for the row under the big two. */
function StatRow({ icon, value, gradient, flyTarget = false, small = false }) {
  const k = small ? 0.78 : 1
  return (
    <div className="relative flex items-center" style={{ height: u(78 * k), transformOrigin: 'left center' }} data-wins-target={flyTarget || undefined}>
      <Icon name={icon} size={u(86 * k)} className="relative" />
      <span className="relative" style={{ fontSize: u(66 * k), marginLeft: u(6) }}>
        <StrokeText stroke={u(13 * k)} gradient={gradient}>
          {value}
        </StrokeText>
      </span>
    </div>
  )
}

/** Active potion timers, shown over the stats while a boost runs. */
function Boosts() {
  const boosts = useGame((s) => s.profile.boosts)
  const now = useNow(1000)
  const active = [
    ['potionMuscle', boosts.muscle],
    ['potionWins', boosts.wins],
  ].filter(([, end]) => end > now)
  if (active.length === 0) return null
  return (
    <div className="flex" style={{ gap: u(10), marginBottom: u(4) }}>
      {active.map(([icon, end]) => (
        <div key={icon} className="flex items-center" style={{ fontSize: u(28) }}>
          <Icon name={icon} size={u(54)} />
          <StrokeText stroke={u(6)}>{formatClock(end - now)}</StrokeText>
        </div>
      ))}
    </div>
  )
}

/**
 * Wins, then Strength, then (a little smaller) your rebirths, with any running potions
 * over them: under the menu, in the left-hand column (LeftMenu).
 */
export function StatsPanel() {
  // While a run's Wins fly home, the counter counts up as they land.
  const wins = useGame((s) => s.winsShown ?? s.profile.wins)
  const muscle = useGame((s) => s.profile.muscle)
  const rebirths = useGame((s) => s.profile.rebirths)

  return (
    <div className="pointer-events-none flex flex-col" style={{ marginLeft: u(2) }}>
      <Boosts />
      <StatRow icon="trophy" value={formatNumber(wins)} gradient={GRADIENTS.gold} flyTarget />
      <StatRow icon="muscle" value={formatNumber(muscle)} />
      <StatRow icon="rebirth" value={formatNumber(rebirths)} gradient={REBIRTH_GRADIENT} small />
    </div>
  )
}

export default StatsPanel
