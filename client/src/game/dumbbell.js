import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { sharedMaterials, STYLE } from './materials'

/**
 * Dumbbells: what every player lifts with, from the wooden starter to the HELL
 * DUMBBELL.
 *
 * One small mesh for all of them - a knurled bar with chrome collars, and at each end a
 * small plate, a big rimmed one, a hub and an end cap - drawn through the shared toy
 * material, so it costs no shader program of
 * its own. Each dumbbell's look (its colour, the toy style its plates are drawn in, and
 * its size) is per instance, so a whole shelf of twenty different dumbbells is a single
 * draw call.
 *
 * Local frame: the bar runs along Z, centred on the origin, about 0.8 long at size 1.
 */

/** Looks by dumbbell id (ids and stats live in shared/balance.js). */
export const DUMBBELL_STYLES = {
  wood: { color: '#b07a45', style: STYLE.SMOOTH, size: 0.85, glow: '#ffd08a' },
  iron: { color: '#7d848e', style: STYLE.SMOOTH, size: 0.9, glow: '#c9d3de' },
  steel: { color: '#c9d3de', style: STYLE.SMOOTH, size: 0.95, glow: '#e8f2ff' },
  copper: { color: '#de7f45', style: STYLE.SMOOTH, size: 1, glow: '#ffae6b' },
  ruby: { color: '#e8323c', style: STYLE.SMOOTH, size: 1, glow: '#ff5a6a' },
  emerald: { color: '#25c95e', style: STYLE.SMOOTH, size: 1.05, glow: '#5cff8f' },
  sapphire: { color: '#2f5fff', style: STYLE.SMOOTH, size: 1.05, glow: '#5c8cff' },
  gold: { color: '#ffc61a', style: STYLE.GLOW, size: 1.1, glow: '#ffd21f' },
  frost: { color: '#8fe2ff', style: STYLE.GLOW, size: 1.1, glow: '#9fe8ff' },
  toxic: { color: '#6fff2a', style: STYLE.GLOW, size: 1.15, glow: '#9dff4a' },
  candy: { color: '#ff7ad9', style: STYLE.STRIPES, size: 1.15, glow: '#ff9ce6' },
  lava: { color: '#ff5a1c', style: STYLE.LAVA, size: 1.2, glow: '#ff6a2a' },
  thunder: { color: '#ffe14a', style: STYLE.GLOW, size: 1.2, glow: '#fff07a' },
  neon: { color: '#39ff88', style: STYLE.GLOW, size: 1.25, glow: '#39ff88' },
  angel: { color: '#ffffff', style: STYLE.GLOW, size: 1.25, glow: '#fff6c4' },
  galaxy: { color: '#4a2fc0', style: STYLE.GALAXY, size: 1.3, glow: '#a46bff' },
  dragon: { color: '#2fd05a', style: STYLE.LAVA, size: 1.35, glow: '#4cff7a' },
  rainbow: { color: '#ffffff', style: STYLE.RAINBOW, size: 1.4, glow: '#ff7ad9' },
  diamond: { color: '#c4f6ff', style: STYLE.GLOW, size: 1.45, glow: '#bff4ff' },
  hell: { color: '#ff2a12', style: STYLE.LAVA, size: 1.6, glow: '#ff3b1e' },
}

const styleOf = (id) => DUMBBELL_STYLES[id] || DUMBBELL_STYLES.wood
const GLOWS = Object.fromEntries(Object.entries(DUMBBELL_STYLES).map(([id, s]) => [id, new Color(s.glow)]))
const COLORS = Object.fromEntries(Object.entries(DUMBBELL_STYLES).map(([id, s]) => [id, new Color(s.color)]))

export const dumbbellGlow = (id) => GLOWS[id] || GLOWS.wood
export const dumbbellSize = (id) => styleOf(id).size

// --- Geometry ------------------------------------------------------------------------

/** A cylinder along Z, `length` long, centred at z, tinted `shade` (the bar is darker). */
function part(radius, length, z, sides, shade) {
  const g = new CylinderGeometry(radius, radius, length, sides)
  g.rotateX(Math.PI / 2)
  g.translate(0, 0, z)
  g.deleteAttribute('uv')
  const n = g.getAttribute('position').count
  g.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(shade), 3))
  return g
}

let baseGeometry = null
/**
 * The dumbbell: a steel bar with a dark knurled grip in the middle and a bright chrome
 * collar either side of it; then at each end a small plate, a big plate with a bright
 * rim round its face, a dark hub and a chrome end cap. Plates take the instance colour
 * fully; the metal is shaded darker or brighter, so it reads as metal in every colour.
 * About 630 triangles.
 */
function dumbbellGeometry() {
  if (baseGeometry) return baseGeometry
  const pieces = [part(0.042, 0.78, 0, 8, 0.7), part(0.052, 0.28, 0, 10, 0.42)]
  for (const side of [-1, 1]) {
    pieces.push(part(0.072, 0.035, side * 0.165, 10, 1.25))
    pieces.push(part(0.17, 0.07, side * 0.205, 14, 0.9))
    pieces.push(part(0.235, 0.11, side * 0.29, 14, 1))
    pieces.push(part(0.248, 0.03, side * 0.335, 14, 1.18))
    pieces.push(part(0.09, 0.03, side * 0.36, 10, 0.55))
    pieces.push(part(0.058, 0.04, side * 0.385, 8, 1.3))
  }
  baseGeometry = mergeGeometries(pieces, false)
  for (const piece of pieces) piece.dispose()
  baseGeometry.computeBoundingSphere()
  return baseGeometry
}

/**
 * Up to `max` dumbbells in one draw call. Place them with setMatrixAt (sized by
 * dumbbellSize) and style them with `setStyle(index, dumbbellId)`; set `.count` to how
 * many to draw.
 */
export function createDumbbellMesh(max) {
  const base = dumbbellGeometry()
  // Own geometry object (it needs its own per-instance style), sharing the vertex buffers.
  const geometry = new BufferGeometry()
  geometry.setIndex(base.index)
  for (const name of ['position', 'normal', 'color']) geometry.setAttribute(name, base.getAttribute(name))
  const styles = new InstancedBufferAttribute(new Float32Array(max), 1)
  geometry.setAttribute('aStyle', styles)
  geometry.boundingSphere = base.boundingSphere

  const mesh = new InstancedMesh(geometry, sharedMaterials().toy, max)
  mesh.setColorAt(0, COLORS.wood)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = true
  const styled = new Array(max).fill(null)

  /** Styles instance `i` as dumbbell `id`; cheap to call every frame. */
  mesh.setStyle = (i, id) => {
    if (styled[i] === id) return
    styled[i] = id
    mesh.setColorAt(i, COLORS[id] || COLORS.wood)
    styles.setX(i, styleOf(id).style)
    mesh.instanceColor.needsUpdate = true
    styles.needsUpdate = true
  }
  return mesh
}

/** Frees a mesh made by createDumbbellMesh (the shared geometry buffers and material stay). */
export function disposeDumbbellMesh(mesh) {
  mesh.geometry.dispose()
  mesh.dispose()
}

const _m = new Matrix4()
const _size = new Vector3()

/**
 * A single dumbbell to hold: `setDumbbell(id)` restyles and resizes it. Lives as a
 * child of whatever holds it (a hand), so it moves exactly with it, the bar across the
 * fist as in an ordinary curl.
 */
export function createHeldDumbbell() {
  const mesh = createDumbbellMesh(1)
  mesh.count = 1
  let current = null
  mesh.setDumbbell = (id) => {
    if (id === current) return
    current = id
    mesh.setStyle(0, id)
    mesh.setMatrixAt(0, _m.makeRotationY(Math.PI / 2).scale(_size.setScalar(dumbbellSize(id))))
    mesh.instanceMatrix.needsUpdate = true
  }
  mesh.setDumbbell('wood')
  return mesh
}
