import { useEffect, useRef } from 'react'

import { TUTORIAL } from '@shared/balance'
import { formatNumber } from '@shared/format'

import { isSlope, STAGES, stageAt, TRACK_LENGTH } from '../../game/push/course'
import { endPush, LOW_POWER, powerLeft, push } from '../../game/push/pushControl'
import { STAGE_THEMES } from '../../game/push/themes'
import { useBloxityStore } from '../../bloxity/store'
import { useGame } from '../../store/game'
import DeathCard from './DeathCard'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { ChunkyButton } from './parts'
import { GRADIENTS, u } from './style'

const stageGradient = (i) => {
  const [a, b, c] = STAGE_THEMES[STAGES[i].id].name
  return `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${c} 100%)`
}
const SAFE_GRADIENT = 'linear-gradient(180deg, #ffffff 0%, #e6fbff 45%, #7fe2ff 100%)'
/** How often the frame-rate push numbers are copied into the DOM. */
const UPDATE_MS = 1000 / 15

/**
 * "💪 196" across the top, as in the reference: your power, draining as you climb and
 * going red as it runs out. Written from the frame-rate push state by a timer, never by
 * React.
 */
function PowerCounter() {
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
    }, UPDATE_MS)
    return () => clearInterval(id)
  }, [])
  return (
    <div
      className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center justify-center"
      style={{
        top: u(14),
        height: u(112),
        padding: `0 ${u(70)}`,
        gap: u(14),
        background: 'linear-gradient(90deg, transparent, rgba(220,240,255,0.35) 20%, rgba(220,240,255,0.35) 80%, transparent)',
      }}
    >
      <Icon name="muscle" size={u(104)} />
      <span ref={ref} className="pp-text" style={{ fontSize: u(96) }}>
        <span data-power aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(16) }} />
        <span data-power data-power-fill className="pp-text-fill" style={{ color: '#ffffff' }} />
      </span>
    </div>
  )
}

/**
 * Where you are: the stage's name and your metres under the counter. Moved from the
 * frame-rate push state by a timer, never by React.
 */
function Climb() {
  const stageRef = useRef(null)
  const meterRef = useRef(null)
  useEffect(() => {
    let shownStage = null
    let shownMeter = -1
    const id = setInterval(() => {
      const meter = Math.max(0, push.meter)
      // Up a slope, its stage's name; on the flat between two, SAFEZONE.
      const si = stageAt(meter)
      const safe = meter > 0 && meter < TRACK_LENGTH && !isSlope(meter)
      const key = safe ? 'safe' : si
      if (key !== shownStage && stageRef.current) {
        shownStage = key
        for (const span of stageRef.current.querySelectorAll('[data-stage]')) span.textContent = safe ? 'SAFEZONE' : STAGES[si].name
        const fill = stageRef.current.querySelector('[data-stage-fill]')
        if (fill) fill.style.backgroundImage = safe ? SAFE_GRADIENT : stageGradient(si)
      }
      const m = Math.floor(meter)
      if (m !== shownMeter && meterRef.current) {
        shownMeter = m
        for (const span of meterRef.current.querySelectorAll('[data-meter]')) span.textContent = `${m} m`
      }
    }, UPDATE_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-baseline" style={{ top: u(120), gap: u(14) }}>
      <span ref={stageRef} className="pp-text" style={{ fontSize: u(38) }}>
        <span data-stage aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(9) }} />
        <span data-stage data-stage-fill className="pp-text-fill" style={{ WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }} />
      </span>
      <span ref={meterRef} className="pp-text" style={{ fontSize: u(28) }}>
        <span data-meter aria-hidden="true" className="pp-text-stroke" style={{ WebkitTextStrokeWidth: u(7) }} />
        <span data-meter className="pp-text-fill" style={{ color: '#ffffff' }} />
      </span>
    </div>
  )
}

/** The last of your power: "LOW POWER!" shaking under the counter. */
function LowPower() {
  const ref = useRef(null)
  useEffect(() => {
    const id = setInterval(() => {
      if (ref.current) ref.current.style.opacity = push.active && push.phase === 'push' && push.strain > 0.02 ? '1' : '0'
    }, UPDATE_MS)
    return () => clearInterval(id)
  }, [])
  return (
    <div ref={ref} className="pp-shake pointer-events-none absolute left-1/2" style={{ top: u(186), marginLeft: u(-160), width: u(320), textAlign: 'center', opacity: 0 }}>
      <span style={{ fontSize: u(44) }}>
        <StrokeText stroke={u(10)} gradient={GRADIENTS.priceShort}>
          LOW POWER!
        </StrokeText>
      </span>
    </div>
  )
}

/** The big message of the moment: a stage cleared, crushed, or THE TOP. */
function Banner() {
  const banner = useGame((s) => s.pushBanner)
  if (!banner) return null
  const stage = STAGES[banner.stage]
  if (banner.kind === 'crushed') {
    return (
      <div key={banner.id} className="pp-banner pointer-events-none absolute left-1/2 top-[42%] flex flex-col items-center text-center">
        <span style={{ fontSize: u(120) }}>
          <StrokeText stroke={u(20)} gradient={GRADIENTS.priceShort}>
            CRUSHED!
          </StrokeText>
        </span>
        <span className="flex items-center" style={{ fontSize: u(44), gap: u(8) }}>
          <StrokeText stroke={u(9)}>{`The ${stage.boulder} needs`}</StrokeText>
          <Icon name="muscle" size={u(56)} />
          <StrokeText stroke={u(9)} gradient={GRADIENTS.gold}>
            {formatNumber(banner.need)}
          </StrokeText>
        </span>
        <span style={{ fontSize: u(36) }}>
          <StrokeText stroke={u(8)}>Train more and try again!</StrokeText>
        </span>
      </div>
    )
  }
  const top = banner.kind === 'top'
  return (
    <div key={banner.id} className="pp-banner pointer-events-none absolute left-1/2 top-[40%] flex flex-col items-center text-center">
      <span style={{ fontSize: u(top ? 120 : 96) }}>
        <StrokeText stroke={u(18)} gradient={top ? GRADIENTS.rainbow : stageGradient(Math.min(STAGES.length - 1, banner.stage + 1))}>
          {top ? 'YOU REACHED THE TOP!' : 'STAGE CLEARED!'}
        </StrokeText>
      </span>
      <span className="flex items-center" style={{ fontSize: u(70), gap: u(10) }}>
        <Icon name="trophy" size={u(90)} />
        <StrokeText stroke={u(14)} gradient={GRADIENTS.gold}>
          {`+${formatNumber(banner.wins)} Wins!`}
        </StrokeText>
      </span>
    </div>
  )
}

/** In a SAFEZONE: what to do next. */
function FreeHint() {
  const free = useGame((s) => s.climb === 'free')
  const atBoulder = useGame((s) => s.zone.climbBoulder >= 0)
  // Cashing in on a WINS pad (its banner's up): you're on your way back to the lobby.
  const cashing = useGame((s) => s.pushBanner?.kind === 'clear')
  // Only the guide says what to do up here: a new player, to take the Wins.
  const guiding = useGame((s) => TUTORIAL[s.profile.tutorialStep]?.event === 'cashIn')
  if (!free || atBoulder || cashing || !guiding) return null
  return (
    // Down at the bottom over the Lobby button, clear of the signs up the track and the HUD at the top.
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center" style={{ bottom: u(124), fontSize: u(32) }}>
      <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
        Step on the WINS pad to get your Wins!
      </StrokeText>
    </div>
  )
}

/** Back to the plaza (Q on a keyboard, or Escape outside Boxity). */
function LobbyButton() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat) return
      // Escape opens Boxity's menu inside Boxity (see bloxity/platform).
      if (e.code === 'KeyQ' || (e.code === 'Escape' && !useBloxityStore.getState().embedded)) endPush('left')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    // Bottom centre.
    <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: u(24) }}>
      <ChunkyButton
        gradient={GRADIENTS.slate}
        onClick={() => endPush('left')}
        title="Back to the lobby"
        radius={10}
        border={4}
        style={{ height: u(76), padding: `0 ${u(20)}`, gap: u(10) }}
      >
        <Icon name="home" size={u(56)} />
        <span style={{ fontSize: u(36) }}>
          <StrokeText stroke={u(8)}>Lobby</StrokeText>
        </span>
      </ChunkyButton>
    </div>
  )
}

/** Up the mountain: your power, where you are, the warnings, the banners, and the way back. */
export function PushHud() {
  const pushing = useGame((s) => s.pushing)
  // Crushed: the death card's Respawn is the way back, not the Lobby button.
  const dead = useGame((s) => s.death !== null)
  if (!pushing) return null
  return (
    <>
      <PowerCounter />
      <Climb />
      <LowPower />
      <FreeHint />
      <Banner />
      <DeathCard />
      {!dead && <LobbyButton />}
    </>
  )
}

export default PushHud
