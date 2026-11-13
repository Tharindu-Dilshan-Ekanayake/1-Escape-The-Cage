import { useEffect, useRef } from 'react'

import { BREAK, MAX_LIFTS_PER_SECOND } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { canBreak, canSmash, padWins } from '@shared/logic'

import { barValue } from '../../game/cages/cageControl'
import { CAGES } from '../../game/cages/course'
import { cageGradient } from '../../game/cages/themes'
import { lift } from '../../game/lift'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from './style'

const gradientCss = ([a, b, c]) => `linear-gradient(180deg, ${a} 0%, ${b} 45%, ${c} 100%)`
/** How often the frame-rate break bar is copied into the DOM. */
const UPDATE_MS = 1000 / 20
/** The least Strength (against a cage's need) that can break it at all, tapping flat out. */
const MIN_RATIO = BREAK.decay / MAX_LIFTS_PER_SECOND / BREAK.hit
const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

/**
 * At a cage's bars: its name and the Strength it takes against yours, and the break bar -
 * a flexing arm riding it as the bars are pulled apart, the bar draining while you don't
 * pull. The whole panel is a button too (tap it, click the view, or E / F), and too weak,
 * it says by how much.
 * The bar is moved from the frame-rate run state by a timer, never by React.
 */
function BreakBar({ cage }) {
  const muscle = useGame((s) => s.profile.muscle)
  const fillRef = useRef(null)
  const fistRef = useRef(null)
  const info = CAGES[cage]

  useEffect(() => {
    let shown = -1
    const id = setInterval(() => {
      const v = Math.round(barValue() * 200) / 200
      if (v === shown) return
      shown = v
      if (fillRef.current) fillRef.current.style.width = `${v * 100}%`
      if (fistRef.current) fistRef.current.style.left = `${v * 100}%`
    }, UPDATE_MS)
    return () => clearInterval(id)
  }, [])

  if (!info) return null
  const strong = muscle >= info.need
  const able = canBreak(muscle, info.need)
  const smash = canSmash(muscle, info.need)
  return (
    <button
      type="button"
      aria-label="Pull the bars apart"
      className="pp-btn pointer-events-auto absolute left-1/2 flex -translate-x-1/2 touch-none flex-col items-center"
      style={{ top: '56%', gap: u(6), background: 'none', border: 'none' }}
      onPointerDown={(e) => {
        e.preventDefault()
        lift()
      }}
    >
      <span className="flex items-baseline whitespace-nowrap" style={{ gap: u(10) }}>
        <span style={{ fontSize: u(30) }}>
          <StrokeText stroke={u(7)}>{`CAGE ${cage + 1}`}</StrokeText>
        </span>
        <span style={{ fontSize: u(44) }}>
          <StrokeText stroke={u(9)} gradient={gradientCss(cageGradient(info.id))}>
            {info.name}
          </StrokeText>
        </span>
      </span>
      <span className="flex items-center whitespace-nowrap" style={{ fontSize: u(34), gap: u(6) }}>
        <Icon name="muscle" size={u(44)} />
        <StrokeText stroke={u(8)} gradient={strong ? GRADIENTS.greenButton : GRADIENTS.priceShort}>
          {formatNumber(muscle)}
        </StrokeText>
        <StrokeText stroke={u(8)}>{` / ${formatNumber(info.need)}`}</StrokeText>
      </span>
      <span
        className="relative block"
        style={{
          width: u(520),
          height: u(46),
          borderRadius: u(10),
          border: `${u(4)} solid #111`,
          background: 'linear-gradient(180deg, #6b1d22 0%, #3a0d12 100%)',
          boxShadow: `0 ${u(4)} 0 rgba(0,0,0,0.45)`,
        }}
      >
        <span
          ref={fillRef}
          className="absolute left-0 top-0 block h-full"
          style={{ width: 0, borderRadius: u(6), background: 'linear-gradient(180deg, #b6ff6a 0%, #57e83a 50%, #19b52a 100%)', transition: 'width 60ms linear' }}
        />
        <span ref={fistRef} className="absolute block" style={{ left: 0, top: '50%', transform: 'translate(-50%, -50%)', transition: 'left 60ms linear' }}>
          <Icon name="muscle" size={u(70)} />
        </span>
      </span>
      <span className={able ? 'pp-pulse' : undefined} style={{ fontSize: u(40), marginTop: u(4) }}>
        {able ? (
          <StrokeText stroke={u(9)} gradient={GRADIENTS.gold}>
            {smash ? 'JUST WALK THROUGH!' : touch ? 'TAP TO PULL THE BARS APART!' : 'CLICK OR PRESS E TO PULL THE BARS APART!'}
          </StrokeText>
        ) : (
          <StrokeText stroke={u(9)} gradient={GRADIENTS.priceShort}>
            {`TOO STRONG! Train to ${formatNumber(Math.ceil(info.need * MIN_RATIO) + 1)}+`}
          </StrokeText>
        )}
      </span>
    </button>
  )
}

/** The big message of the moment: a cage broken open, Wins from a pad, or a world escaped. */
function Banner() {
  const banner = useGame((s) => s.banner)
  if (!banner) return null
  if (banner.kind === 'smash') {
    const cage = CAGES[banner.cage]
    if (!cage) return null
    return (
      <div key={banner.id} className="pp-banner pointer-events-none absolute left-1/2 top-[30%] flex flex-col items-center text-center">
        <span style={{ fontSize: u(46) }}>
          <StrokeText stroke={u(10)} gradient={gradientCss(cageGradient(cage.id))}>
            {cage.name}
          </StrokeText>
        </span>
        <span style={{ fontSize: u(104) }}>
          <StrokeText stroke={u(18)} gradient={GRADIENTS.gold}>
            BROKEN OPEN!
          </StrokeText>
        </span>
      </div>
    )
  }
  const escaped = banner.kind === 'escaped'
  return (
    <div key={banner.id} className="pp-banner pointer-events-none absolute left-1/2 top-[36%] flex flex-col items-center text-center">
      {escaped ? (
        <span style={{ fontSize: u(110) }}>
          <StrokeText stroke={u(18)} gradient={GRADIENTS.rainbow}>
            YOU ESCAPED!
          </StrokeText>
        </span>
      ) : (
        <span className="flex items-center" style={{ fontSize: u(88), gap: u(12) }}>
          <Icon name="trophy" size={u(110)} />
          <StrokeText stroke={u(16)} gradient={GRADIENTS.gold}>
            {`+${formatNumber(banner.wins)} WINS!`}
          </StrokeText>
        </span>
      )}
    </div>
  )
}

/** In the cages: which room you're in, and what its WIN pad on your left pays you. */
function RoomChip({ room }) {
  const wins = useGame((s) => padWins(s.profile, room, Date.now()))
  return (
    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center whitespace-nowrap" style={{ left: 'var(--level-center, 50%)', bottom: 'calc(var(--level-top, 0px) + 8px)', gap: u(2) }}>
      <span style={{ fontSize: u(30) }}>
        <StrokeText stroke={u(7)}>{`ROOM ${room + 1} / ${CAGES.length}`}</StrokeText>
      </span>
      <span className="flex items-center" style={{ fontSize: u(30), gap: u(6) }}>
        <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
          WIN pad on your left:
        </StrokeText>
        <Icon name="trophy" size={u(38)} />
        <StrokeText stroke={u(7)} gradient={GRADIENTS.gold}>
          {`+${formatNumber(wins)}`}
        </StrokeText>
      </span>
    </div>
  )
}

/** The cages' own HUD: the break bar at a cage's bars, the room you're in, and the banners. */
export function CageHud() {
  const cage = useGame((s) => s.zone.cage)
  const room = useGame((s) => s.zone.room)
  return (
    <>
      {cage >= 0 && <BreakBar key={cage} cage={cage} />}
      {cage < 0 && room >= 0 && <RoomChip room={room} />}
      <Banner />
    </>
  )
}

export default CageHud
