import { BufferAttribute, BufferGeometry, Color, CylinderGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BODIES } from '@shared/balance'

import { BODY_LOOKS } from './bodies'
import { sharedMaterials } from './materials'

/**
 * The dumbbell every player trains with: in the colours of the body they wear (a gold
 * one for the Golden Body...), and a little bigger every tier.
 *
 * One small mesh for all of them - a knurled bar with chrome collars, and at each end a
 * small plate, a big rimmed one, a hub and an end cap - drawn through the shared toy
 * material, so it costs no shader program of its own. Each one's look (its colour, the
 * toy style its plates are drawn in, and its size) is per instance.
 *
 * Local frame: the bar runs along Z, centred on the origin, about 0.8 long at size 1.
 */

/** Looks by body id: the body's colour and style, a little bigger a tier at a time (never hiding the arms). */
export const DUMBBELL_STYLES = Object.fromEntries(
  BODIES.map((body, i) => [body.id, { color: BODY_LOOKS[body.id].color, style: BODY_LOOKS[body.id].style, size: 0.8 + i * 0.012, glow: BODY_LOOKS[body.id].color }]),
)

const styleOf = (id) => DUMBBELL_STYLES[id] || DUMBBELL_STYLES.noodle
const GLOWS = Object.fromEntries(Object.entries(DUMBBELL_STYLES).map(([id, s]) => [id, new Color(s.glow)]))
const COLORS = Object.fromEntries(Object.entries(DUMBBELL_STYLES).map(([id, s]) => [id, new Color(s.color)]))

export const dumbbellGlow = (id) => GLOWS[id] || GLOWS.noodle
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
  mesh.setColorAt(0, COLORS.noodle)
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = true
  const styled = new Array(max).fill(null)

  /** Styles instance `i` as the dumbbell of body `id`; cheap to call every frame. */
  mesh.setStyle = (i, id) => {
    if (styled[i] === id) return
    styled[i] = id
    mesh.setColorAt(i, COLORS[id] || COLORS.noodle)
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
 * A single dumbbell to hold: `setDumbbell(bodyId)` restyles and resizes it. Lives as a
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
  mesh.setDumbbell('noodle')
  return mesh
}
