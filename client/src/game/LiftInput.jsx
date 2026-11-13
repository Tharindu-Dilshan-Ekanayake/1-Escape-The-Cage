import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

import { useGame } from '../store/game'
import { lift } from './lift'

/** A press that moves less than this (px) and lets go this soon (ms) is a click, not a drag. */
const CLICK_SLOP = 8
const CLICK_MS = 400
/** Keys that tap too (held down, they don't repeat: every hit is a press). E only at a cage. */
const TAP_KEYS = new Set(['KeyE', 'KeyF', 'Enter'])

/**
 * "Every tap gives you Strength": a click or tap on the 3D view (not a drag to turn the
 * camera), or E / F / Enter, lifts your dumbbell - or, at a cage's bars, pulls them apart.
 * Non-visual.
 */
export function LiftInput() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const el = gl.domElement
    const presses = new Map()
    const onDown = (e) => {
      if (e.button !== 0) return
      presses.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
    }
    const onUp = (e) => {
      const press = presses.get(e.pointerId)
      presses.delete(e.pointerId)
      if (!press || useGame.getState().panel) return
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      if (moved < CLICK_SLOP && performance.now() - press.t < CLICK_MS) lift()
    }
    const onCancel = (e) => presses.delete(e.pointerId)
    const onKey = (e) => {
      if (e.repeat || !TAP_KEYS.has(e.code) || useGame.getState().panel) return
      // E is the prompts' key (buy, claim...); it taps only at a cage, where there's none.
      if (e.code === 'KeyE' && useGame.getState().zone.cage < 0) return
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return
      lift()
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [gl])

  return null
}

export default LiftInput
