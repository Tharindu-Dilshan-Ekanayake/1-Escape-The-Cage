import { useEffect, useRef } from 'react'

import { formatClock, formatNumber } from '@shared/format'

import { LOW_POWER, powerLeft, push } from '../../game/push/pushControl'
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
 * Your power while you push a boulder: counting down as you climb, going red as it runs
 * out. Written from the frame-rate push state by a timer, never by React.
 */
function PowerRow() {
  const ref = useRef(null)
  useEffect(() => {
    let shown = null
    const id = setInterval(() => {
      const el = ref.current
      if (!el) return
      const left = Math.floor(powerLeft())
      const text = formatNumber(left)
      if (text === shown) return
      shown = text
      for (const span of el.querySelectorAll('[data-power]')) span.textContent = text
      const fill = el.querySelector('[data-power-fill]')
      if (fill) fill.style.color = left <= push.power * LOW_POWER ? '#ff5a4a' : '#ffffff'
    }, 1000 / 15)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="relative flex items-center" style={{ height: u(78) }}>
      <Icon name="muscle" size={u(86)} className="relative" />
      <span ref={ref} className="pp-text relative" style={{ fontSize: u(66), marginLeft: u(6) }}>
        <span data-power aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(13) }} />
        <span data-power data-power-fill className="pp-text-fill" style={{ color: '#ffffff' }} />
      </span>
    </div>
  )
}

/**
 * Bottom-left, as in the reference: Wins, then Muscle, then (a little smaller) your
 * rebirths, with any running potions over them. While you push a boulder the Muscle is
 * your power, counting down as you climb; it's full again when you get to a SAFEZONE.
 */
export function StatsPanel() {
  // While a climb's Wins fly home, the counter counts up as they land.
  const wins = useGame((s) => s.winsShown ?? s.profile.wins)
  const muscle = useGame((s) => s.profile.muscle)
  const rebirths = useGame((s) => s.profile.rebirths)
  const pushingBoulder = useGame((s) => s.climb === 'push')

  return (
    <div className="pointer-events-none absolute flex flex-col" style={{ left: u(20), bottom: u(120) }}>
      <Boosts />
      <StatRow icon="trophy" value={formatNumber(wins)} gradient={GRADIENTS.gold} flyTarget />
      {pushingBoulder ? <PowerRow /> : <StatRow icon="muscle" value={formatNumber(muscle)} />}
      <StatRow icon="rebirth" value={formatNumber(rebirths)} gradient={REBIRTH_GRADIENT} small />
    </div>
  )
}

export default StatsPanel
