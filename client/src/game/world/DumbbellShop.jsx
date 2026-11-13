import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { DUMBBELLS } from '@shared/balance'
import { DUMBBELL_PADS, PAD_SIZE } from '@shared/world'

import { useGame } from '../../store/game'
import { getQuality } from '../../store/quality'
import { BlockSet, disposeBlocks } from '../blocks'
import { createDumbbellMesh, disposeDumbbellMesh, dumbbellGlow, dumbbellSize } from '../dumbbell'
import { createGlowInstances, disposeGlow } from '../glow'
import { padLabelSpec, padState } from '../labels/lobbyLabels'
import { updateWorldLabel } from '../labels/registry'
import { sharedMaterials, STYLE } from '../materials'

/** Pad colours by state, as in the reference: red to buy, blue owned, gold equipped. */
const PAD_COLORS = {
  equipped: new Color('#ffd21f'),
  owned: new Color('#38c8ff'),
  buy: new Color('#ff3b3b'),
  locked: new Color('#8a1f26'),
}

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _s = new Vector3()
const _glow = new Vector3()

/** Height of a stand's glowing cap above its pad; the dumbbell floats over it. */
const CAP_TOP = 1.12
const HOVER = CAP_TOP + 1.2
/** Shown bigger than in the hand, so the shelf reads from across the plaza. */
const DISPLAY_SCALE = 2.1

/**
 * Display stands, all in one block set. The first DUMBBELL_PADS.length blocks are the
 * pads themselves (recoloured by state, so their instance index is the pad index); the
 * trimmings follow.
 */
function buildStands() {
  const set = new BlockSet()
  const slab = PAD_SIZE - 0.4
  for (const pad of DUMBBELL_PADS) set.addOn(pad.x, pad.y - 0.1, pad.z, slab, 0.3, slab, '#ffffff', STYLE.STUDS)
  for (const pad of DUMBBELL_PADS) {
    const id = DUMBBELLS[pad.index].id
    const { x, y, z } = pad
    // Grey stone frame, standing clear of the pad's top.
    const e = slab / 2 + 0.1
    for (const side of [-1, 1]) {
      set.addOn(x, y - 0.1, z + side * e, slab + 0.5, 0.45, 0.3, '#c7cfd8', STYLE.SMOOTH)
      set.addOn(x + side * e, y - 0.1, z, 0.3, 0.45, slab + 0.2, '#c7cfd8', STYLE.SMOOTH)
    }
    // A glowing square ring on the pad in the dumbbell's own glow colour.
    const glow = dumbbellGlow(id)
    for (const side of [-1, 1]) {
      set.addOn(x, y + 0.2, z + side * 1.25, 2.68, 0.06, 0.18, glow, STYLE.GLOW)
      set.addOn(x + side * 1.25, y + 0.2, z, 0.18, 0.06, 2.32, glow, STYLE.GLOW)
    }
    // An octagonal pedestal: a gold foot, a white column and a glowing cap in the
    // dumbbell's colour.
    for (const turn of [0, Math.PI / 4]) {
      set.addOn(x, y + 0.2, z, 1.4, 0.16, 1.4, '#ffd21f', STYLE.SMOOTH, turn)
      set.addOn(x, y + 0.36, z, 1.0, 0.56, 1.0, '#f4f7fb', STYLE.SMOOTH, turn)
      set.addOn(x, y + 0.92, z, 1.45, CAP_TOP - 0.92, 1.45, glow, STYLE.GLOW, turn)
    }
    // Gold-topped posts at the corners, red velvet rope between them - open on the side
    // facing the plaza (west), where you step up to buy.
    const c = 1.75
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        set.addOn(x + sx * c, y + 0.2, z + sz * c, 0.14, 0.75, 0.14, '#d8a21c', STYLE.SMOOTH)
        set.add(x + sx * c, y + 1.0, z + sz * c, 0.22, 0.22, 0.22, '#ffd21f', STYLE.GLOW, 0.785, 0.6, 0)
      }
    }
    for (const sz of [-1, 1]) set.add(x, y + 0.82, z + sz * c, c * 2, 0.07, 0.07, '#c4162a', STYLE.SMOOTH)
    set.add(x + c, y + 0.82, z, 0.07, 0.07, c * 2, '#c4162a', STYLE.SMOOTH)
  }
  return set.build(sharedMaterials().blocks)
}

/**
 * The dumbbell shop: twenty display stands on the two shop stages, each a pad framed in
 * stone with a glowing pedestal and its dumbbell floating above it, turning slowly.
 * Pads recolour and their labels rewrite as you buy and equip. Three draw calls:
 * stands, dumbbells, halos.
 */
export function DumbbellShop() {
  const owned = useGame((s) => s.profile.ownedDumbbells)
  const equipped = useGame((s) => s.profile.equippedDumbbell)
  const padsRef = useRef(null)
  const dumbbellsRef = useRef(null)
  const glowRef = useRef(null)

  const assets = useMemo(() => {
    const pads = buildStands()
    // All twenty dumbbells, each in its own look, in one draw call.
    const dumbbells = createDumbbellMesh(DUMBBELLS.length)
    DUMBBELLS.forEach((dumbbell, i) => dumbbells.setStyle(i, dumbbell.id))
    dumbbells.count = DUMBBELLS.length
    // Each one glows in its own colour.
    const glows = createGlowInstances(DUMBBELLS.length, 0.7)
    DUMBBELLS.forEach((dumbbell, i) => glows.setColorAt(i, dumbbellGlow(dumbbell.id)))
    glows.count = DUMBBELLS.length
    glows.instanceColor.needsUpdate = true
    return { pads, dumbbells, glows }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.pads)
      disposeDumbbellMesh(assets.dumbbells)
      disposeGlow(assets.glows)
    },
    [assets],
  )

  // Recolour pads and rewrite their labels whenever ownership changes.
  useEffect(() => {
    const pads = padsRef.current
    const profile = { ownedDumbbells: owned, equippedDumbbell: equipped }
    for (const pad of DUMBBELL_PADS) {
      const state = padState(profile, pad.index)
      pads?.setColorAt(pad.index, PAD_COLORS[state])
      updateWorldLabel(`pad-${pad.index}`, padLabelSpec(pad.index, state))
    }
    if (pads?.instanceColor) pads.instanceColor.needsUpdate = true
  }, [owned, equipped])

  useFrame((state) => {
    const dumbbells = dumbbellsRef.current
    const glows = glowRef.current
    if (!dumbbells || !glows) return
    const t = state.clock.elapsedTime
    const glowSize = 3.4 * getQuality().glow
    for (const pad of DUMBBELL_PADS) {
      const id = DUMBBELLS[pad.index].id
      _p.set(pad.x, pad.y + HOVER + Math.sin(t * 1.6 + pad.index) * 0.15, pad.z)
      // Bar level and turning slowly, tipped a little so the plates catch the light.
      _q.setFromEuler(_e.set(0.35, t * 0.8 + pad.index, 0.2, 'YXZ'))
      _s.setScalar(DISPLAY_SCALE * dumbbellSize(id))
      dumbbells.setMatrixAt(pad.index, _m.compose(_p, _q, _s))
      glows.setMatrixAt(pad.index, _m.compose(_p, _q, _glow.setScalar(glowSize)))
    }
    dumbbells.instanceMatrix.needsUpdate = true
    glows.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={padsRef} object={assets.pads} />
      <primitive ref={dumbbellsRef} object={assets.dumbbells} />
      <primitive ref={glowRef} object={assets.glows} />
    </>
  )
}

export default DumbbellShop
