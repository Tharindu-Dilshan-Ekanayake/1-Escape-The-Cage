import { useEffect, useState } from 'react'

/**
 * The screen the HUD lays itself out for: its size in CSS pixels, whether it's portrait,
 * the HUD unit (`px`: one reference pixel, as --px works it out in index.css) and whether
 * it's a touch screen (the on-screen controls are up). Re-read on every resize and turn.
 */

function detectTouch() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

/** Touch, once known: a touch anywhere on a screen that didn't say so switches it on. */
let touch = detectTouch()
const listeners = new Set()
if (typeof window !== 'undefined' && !touch) {
  const onPointer = (e) => {
    if (e.pointerType !== 'touch') return
    touch = true
    window.removeEventListener('pointerdown', onPointer)
    for (const fn of listeners) fn()
  }
  window.addEventListener('pointerdown', onPointer)
}

/** One reference pixel on a `w` x `h` screen, exactly as index.css sets --px. */
export function hudUnit(w, h) {
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))
  return h > w ? clamp(Math.min(w / 1000, h / 1800), 0.3, 1.4) : clamp(Math.min(w / 1920, h / 1080), 0.42, 1.4)
}

const read = () => {
  const w = window.innerWidth
  const h = window.innerHeight
  return { w, h, portrait: h > w, px: hudUnit(w, h), touch }
}

export function useScreen() {
  const [screen, setScreen] = useState(read)
  useEffect(() => {
    const update = () =>
      setScreen((prev) => {
        const next = read()
        return prev.w === next.w && prev.h === next.h && prev.touch === next.touch ? prev : next
      })
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    listeners.add(update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      listeners.delete(update)
    }
  }, [])
  return screen
}

/**
 * The touch controls (TouchControls), in CSS pixels: the LIFT button and the jump button
 * in the bottom-right corner - smaller on a short, sideways screen (`compact`) - and how
 * much of the corner they take.
 */
export function touchControls({ h, portrait }) {
  const compact = !portrait && h < 520
  return compact
    ? { compact, lift: { size: 86, right: 76, bottom: 10 }, jump: { size: 58, right: 10, bottom: 12 }, width: 170, height: 104 }
    : { compact, lift: { size: 104, right: 96, bottom: 12 }, jump: { size: 70, right: 14, bottom: 14 }, width: 212, height: 124 }
}

/** The level bar and its packs (LevelBar), at full size, in reference pixels. */
const LEVEL_BAR = { width: 836, height: 190, bottom: 18 }
/** A menu tile and the gap between tiles (LeftMenu), and the stats under them, in reference pixels. */
const TILE = { width: 110, height: 104, gap: 14 }
const STATS = { width: 270, height: 260, gap: 18 }
const EDGE = 16

/** The menu's tiles, two to a row, in reference pixels. */
const MENU = { width: 2 * TILE.width + TILE.gap, height: 4 * TILE.height + 3 * TILE.gap }

/** The left-hand column's size at full scale, in reference pixels: the menu with the stats under it. */
const COLUMN = { width: Math.max(MENU.width, STATS.width), height: MENU.height + STATS.gap + STATS.height }

/**
 * Where everything in the HUD goes on this screen, all in CSS pixels, worked out together
 * so that nothing lands on anything else, upright or sideways:
 *
 * - `column`: the menu, its tiles two to a row, with the stats under it, down the left:
 *   its `top`, and the `scale` that fits it in. Upright, below Boxity's toolbar and chat
 *   (`clearLeft`, how far they reach down); sideways or on a computer, in the middle of
 *   the left side, below Boxity's toolbar alone (`clearToolbar`).
 * - `level`: the level bar along the bottom, centred in the gap between the column and
 *   the touch controls (`center`), shrunk to fit it (`scale`); `bottom` lifts it over the
 *   controls only on an upright phone, where there's no room beside them. `top` is how
 *   far up from the bottom it reaches (the room chip and prompts sit above it).
 * - `controls`: the touch controls (touchControls), or null without touch.
 */
export function hudLayout(screen, clearLeft = 0, clearToolbar = 0) {
  const { w, h, px, touch, portrait } = screen
  const controls = touch ? touchControls(screen) : null
  const edge = EDGE * px
  const levelWidth = LEVEL_BAR.width * px
  const levelHeight = (LEVEL_BAR.height + LEVEL_BAR.bottom) * px

  const fits = (room) => Math.min(1, room / (COLUMN.height * px))

  if (portrait) {
    // The column: below Boxity's toolbar and chat.
    const top = Math.max(px * 60, clearLeft + 8)
    // Upright: the level bar goes over the controls when it would meet them, across the
    // middle; the column stops above it.
    const right = controls ? w - controls.width - 8 : w - 8
    const lifted = controls && w / 2 + levelWidth / 2 > right
    const bottom = lifted ? controls.height + 8 : 0
    const scale = Math.min(1, (w - 16) / levelWidth)
    const levelTop = bottom + levelHeight * scale
    const room = h - top - levelTop - 12
    return { controls, column: { top, scale: fits(room) }, level: { center: w / 2, bottom, scale, top: levelTop } }
  }

  // Sideways (or a computer): the column in the middle of the left side, between
  // Boxity's toolbar and the bottom, shrunk if need be to fit.
  const from = Math.max(px * 110, clearToolbar + 8)
  const room = h - from - 8
  const columnScale = fits(room)
  const columnHeight = COLUMN.height * px * columnScale
  const top = from + (room - columnHeight) / 2
  const columnRight = edge + COLUMN.width * px * columnScale
  const columnBottom = top + columnHeight
  // The bar's gap: from the column (where it comes down into the bar's band) to the
  // controls; centred on the screen if it fits there, else in the middle of the gap.
  const left = columnBottom > h - levelHeight ? columnRight + 10 : 8
  const right = controls ? w - controls.width - 8 : w - 8
  const scale = Math.max(0.5, Math.min(1, (right - left) / levelWidth))
  const half = (levelWidth * scale) / 2
  const center = w / 2 - half >= left && w / 2 + half <= right ? w / 2 : (left + right) / 2
  return { controls, column: { top, scale: columnScale }, level: { center, bottom: 0, scale, top: levelHeight * scale } }
}
