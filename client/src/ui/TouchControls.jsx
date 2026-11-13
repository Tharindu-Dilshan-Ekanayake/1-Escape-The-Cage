import { useEffect, useRef } from 'react'

import { lift } from '../game/lift'
import { runtime } from '../game/runtime'
import { useGame } from '../store/game'
import { GRADIENTS } from './hud/style'
import { touchControls, useScreen } from './screen'
import { iconUrl } from './icons'

/** Joystick travel radius, in CSS pixels. */
const RADIUS = 56

/** The chunky round look of the HUD's buttons, sized in CSS pixels. */
const roundButton = (size, background) => ({
  width: size,
  height: size,
  background,
  border: '4px solid #111',
})

/**
 * On-screen controls for touch devices: a floating joystick that appears wherever the
 * left side of the screen is touched, a big LIFT button (PULL at a cage's bars, where
 * it heaves them apart) and a jump button. Everything else is walking up to things - a Train
 * Zone, a pad, a cage - or tapping their prompt.
 *
 * Writes straight into `runtime.input` and moves the knob through refs, so dragging
 * never re-renders React.
 */
export function TouchControls() {
  const screen = useScreen()
  const isTouch = screen.touch
  const { compact, lift: liftButton, jump: jumpButton } = touchControls(screen)
  // At rest the joystick shows a faint ring - not on a short, sideways screen, where the
  // menu and stats fill that corner (it still comes up wherever you touch).
  const restOpacity = compact ? '0' : '0.35'
  const atCage = useGame((s) => s.zone.cage >= 0)
  const ready = useGame((s) => s.playable)
  const baseRef = useRef(null)
  const knobRef = useRef(null)
  const active = useRef({ id: null, x: 0, y: 0 })

  // A touchscreen laptop can start with a mouse; show the controls on first touch.
  useEffect(
    () => () => {
      runtime.input.joyX = 0
      runtime.input.joyY = 0
      runtime.input.jump = false
    },
    [],
  )

  if (!isTouch) return null

  const show = (x, y) => {
    const base = baseRef.current
    if (!base) return
    base.style.opacity = '1'
    base.style.left = `${x - RADIUS}px`
    base.style.top = `${y - RADIUS}px`
  }

  const onDown = (e) => {
    if (active.current.id !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    active.current = { id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top }
    show(active.current.x, active.current.y)
  }

  const onMove = (e) => {
    const a = active.current
    if (a.id !== e.pointerId) return
    const rect = e.currentTarget.getBoundingClientRect()
    let dx = e.clientX - rect.left - a.x
    let dy = e.clientY - rect.top - a.y
    const len = Math.hypot(dx, dy)
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS
      dy = (dy / len) * RADIUS
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    // Unit direction times strength, with a small dead zone so a resting thumb
    // doesn't creep.
    const strength = Math.max(0, Math.min(len, RADIUS) / RADIUS - 0.08) / 0.92
    runtime.input.joyX = len > 0 ? (dx / Math.min(len, RADIUS)) * strength : 0
    runtime.input.joyY = len > 0 ? (-dy / Math.min(len, RADIUS)) * strength : 0
  }

  const onUp = (e) => {
    if (active.current.id !== e.pointerId) return
    active.current.id = null
    runtime.input.joyX = 0
    runtime.input.joyY = 0
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)'
    if (baseRef.current) baseRef.current.style.opacity = restOpacity
  }

  return (
    <>
      <div
        className="absolute bottom-0 left-0 z-10 h-[62%] w-[42%] touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          ref={baseRef}
          className="pointer-events-none absolute rounded-full border-4 border-white/70 bg-black/25"
          style={{
            width: RADIUS * 2,
            height: RADIUS * 2,
            opacity: restOpacity,
            // Resting low in the middle of its patch, clear of the stats in the corner (it
            // moves to wherever you touch).
            left: `calc(50% - ${RADIUS}px)`,
            top: `calc(100% - ${RADIUS * 2 + 22}px)`,
          }}
        >
          <div
            ref={knobRef}
            className="absolute rounded-full border-4 border-black/40 bg-white/90 shadow-lg"
            style={{ width: RADIUS, height: RADIUS, left: RADIUS / 2, top: RADIUS / 2 }}
          />
        </div>
      </div>

      {ready && (
        <button
          type="button"
          aria-label={atCage ? 'Pull' : 'Lift'}
          className="pp-btn pp-chunky pp-pulse absolute z-20 flex touch-none flex-col items-center justify-center rounded-full"
          style={{ ...roundButton(liftButton.size, GRADIENTS.goldButton), right: liftButton.right, bottom: liftButton.bottom }}
          onPointerDown={(e) => {
            e.preventDefault()
            lift()
          }}
        >
          <span className="pp-gloss" style={{ borderRadius: `${liftButton.size / 2}px ${liftButton.size / 2}px 30px 30px` }} />
          <img src={iconUrl('muscle')} alt="" width={liftButton.size * 0.56} height={liftButton.size * 0.56} draggable={false} />
          <span className="pp-stroke" style={{ fontSize: liftButton.size * 0.17, marginTop: -6 }}>
            {atCage ? 'PULL' : 'LIFT'}
          </span>
        </button>
      )}

      <button
        type="button"
        aria-label="Jump"
        className="pp-btn pp-chunky absolute z-20 flex touch-none items-center justify-center rounded-full text-white"
        style={{ ...roundButton(jumpButton.size, GRADIENTS.slate), right: jumpButton.right, bottom: jumpButton.bottom }}
        onPointerDown={(e) => {
          e.preventDefault()
          runtime.input.jump = true
        }}
        onPointerUp={() => {
          runtime.input.jump = false
        }}
        onPointerCancel={() => {
          runtime.input.jump = false
        }}
        onPointerLeave={() => {
          runtime.input.jump = false
        }}
      >
        <span className="pp-gloss" style={{ borderRadius: `${jumpButton.size / 2}px ${jumpButton.size / 2}px 20px 20px` }} />
        <svg viewBox="0 0 24 24" width={jumpButton.size * 0.5} height={jumpButton.size * 0.5} fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  )
}

export default TouchControls
