import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Sphere,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { BODIES } from '@shared/balance'
import { BODY_PADS, PAD_SIZE } from '@shared/world'

import { useGame } from '../../store/game'
import { getQuality, useQuality } from '../../store/quality'
import { bakeShowcase } from '../avatarRig'
import { bodyColor, bodyLook } from '../bodies'
import { useShowcase } from '../bodyShowcase'
import { BlockSet, disposeBlocks } from '../blocks'
import { createGlowInstances, disposeGlow } from '../glow'
import { padLabelSpec, padState } from '../labels/lobbyLabels'
import { updateWorldLabel } from '../labels/registry'
import { sharedMaterials, STYLE } from '../materials'
import { flexingBodybuilder } from '../muscleBody'

/** Pad colours by state: red to buy, blue owned, gold worn. */
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

/** Height of a stand's glowing cap above its pad; the statue stands on it. */
const CAP_TOP = 1.12
/** How tall a statue of a plain-height body stands (each is its body's height and width). */
const STATUE_HEIGHT = 2.2
/** The statues' model's height, in avatar units: from the feet to the top of the head. */
const MODEL_HEIGHT = 6.45
/**
 * How finely the statues are divided: two dozen stand in view at once, so more coarsely
 * than the players' own bodies (whose shapes they are).
 */
const STATUE_DETAIL = { torso: { along: 6, around: [4, 2] }, arm: { along: 7, around: [2, 2] }, leg: { along: 6, around: [2, 2] } }
/** Coarser still on LOW: 550 triangles a statue rather than 670. */
const STATUE_DETAIL_LOW = { torso: { along: 5, around: [3, 2] }, arm: { along: 6, around: [2, 2] }, leg: { along: 5, around: [2, 2] } }

/** How finely the statues are divided, for this quality. */
const statueDetail = () => (getQuality().decorDensity < 0.5 ? STATUE_DETAIL_LOW : STATUE_DETAIL)
/** Scratch for setMorphAt: one influence, how built a statue is. */
const _morph = { morphTargetInfluences: [0] }

/**
 * Display stands, all in one block set. The first BODY_PADS.length blocks are the pads
 * themselves (recoloured by state, so their instance index is the pad index); the
 * trimmings follow.
 */
function buildStands() {
  const set = new BlockSet()
  const slab = PAD_SIZE - 0.4
  for (const pad of BODY_PADS) set.addOn(pad.x, pad.y - 0.1, pad.z, slab, 0.3, slab, '#ffffff', STYLE.STUDS)
  for (const pad of BODY_PADS) {
    const look = bodyLook(BODIES[pad.index].id)
    const { x, y, z } = pad
    // Grey stone frame, standing clear of the pad's top.
    const e = slab / 2 + 0.1
    for (const side of [-1, 1]) {
      set.addOn(x, y - 0.1, z + side * e, slab + 0.5, 0.45, 0.3, '#c7cfd8', STYLE.SMOOTH)
      set.addOn(x + side * e, y - 0.1, z, 0.3, 0.45, slab + 0.2, '#c7cfd8', STYLE.SMOOTH)
    }
    // A glowing square ring on the pad in the body's colour.
    for (const side of [-1, 1]) {
      set.addOn(x, y + 0.2, z + side * 1.25, 2.68, 0.06, 0.18, look.color, STYLE.GLOW)
      set.addOn(x + side * 1.25, y + 0.2, z, 0.18, 0.06, 2.32, look.color, STYLE.GLOW)
    }
    // An octagonal pedestal: a gold foot, a white column and a glowing cap in the body's colour.
    for (const turn of [0, Math.PI / 4]) {
      set.addOn(x, y + 0.2, z, 1.4, 0.16, 1.4, '#ffd21f', STYLE.SMOOTH, turn)
      set.addOn(x, y + 0.36, z, 1.0, 0.56, 1.0, '#f4f7fb', STYLE.SMOOTH, turn)
      set.addOn(x, y + 0.92, z, 1.45, CAP_TOP - 0.92, 1.45, look.color, STYLE.GLOW, turn)
    }
  }
  return set.build(sharedMaterials().blocks)
}

/** A whole bodybuilder in the double-biceps flex, `build` built (muscleBody), with a blocky head, as one geometry. */
function statueShape(build) {
  const parts = flexingBodybuilder(build, statueDetail())
  const head = new BoxGeometry(1.6, 1.6, 1.6).toNonIndexed().translate(0, 5.65, 0)
  head.deleteAttribute('uv')
  const merged = mergeGeometries([parts.torso, parts.arm_L, parts.arm_R, parts.leg_L, parts.leg_R, head], false)
  for (const part of Object.values(parts)) part.dispose()
  head.dispose()
  // Feet on the ground, 1 tall, facing -x (the plaza).
  merged.scale(1 / MODEL_HEIGHT, 1 / MODEL_HEIGHT, 1 / MODEL_HEIGHT)
  merged.rotateY(-Math.PI / 2)
  return merged
}

/** Culled as one, by bounds round every stand (the statues turn, but never leave them). */
function standsBounds() {
  const pads = BODY_PADS.reduce(
    (b, pad) => ({ minX: Math.min(b.minX, pad.x), maxX: Math.max(b.maxX, pad.x), minZ: Math.min(b.minZ, pad.z), maxZ: Math.max(b.maxZ, pad.z) }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  )
  return new Sphere(
    new Vector3((pads.minX + pads.maxX) / 2, 3, (pads.minZ + pads.maxZ) / 2),
    Math.hypot(pads.maxX - pads.minX, pads.maxZ - pads.minZ) / 2 + STATUE_HEIGHT * 2,
  )
}

/** Each avatar statue as built as its body (the morph, per instance). */
function buildStatues(mesh) {
  BODIES.forEach((body, i) => {
    _morph.morphTargetInfluences[0] = bodyLook(body.id).bulk
    mesh.setMorphAt(i, _morph)
  })
  mesh.morphTexture.needsUpdate = true
}

/** Plain white, for the avatar statues' material before there's an avatar to dress it in. */
const BLANK = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
BLANK.colorSpace = SRGBColorSpace
BLANK.needsUpdate = true

/**
 * The statues as you: your own avatar (avatarRig.bakeShowcase) flexing on every stand in
 * that stand's body - your own colours and clothes, exactly as on you, only the shape
 * changing - thin with the bodybuilder as its morph, so each is as built as its body,
 * scaled to its height and width like the plain ones. One draw call. Null if the avatar
 * can't be baked.
 */
function avatarStatues(rig, proportions) {
  const geometry = bakeShowcase(rig, proportions, statueDetail())
  if (!geometry) return null
  // Feet on the ground, 1 tall, facing -x (the plaza); the morph turned and scaled with it.
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const size = box.max.y - box.min.y
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
  const turn = new Matrix4().makeRotationY(-Math.PI / 2)
  const fit = new Matrix4().makeScale(1 / size, 1 / size, 1 / size).premultiply(turn)
  geometry.applyMatrix4(fit)
  geometry.morphAttributes.position[0].applyMatrix4(fit)
  geometry.morphAttributes.normal[0].applyMatrix4(turn)
  const mesh = new InstancedMesh(geometry, new MeshLambertMaterial({ map: rig.body.material.map ?? BLANK }), BODIES.length)
  buildStatues(mesh)
  mesh.boundingSphere = standsBounds()
  mesh.castShadow = true
  return mesh
}

/**
 * A stand-in with just what the avatar statues ask of their shader, hidden, from the
 * start: the start-up warm-up compiles their program with everything else, so they draw
 * without a stall of their own the moment your avatar is in.
 */
function statueWarmup() {
  const geometry = new BufferGeometry()
  const vec = (size) => new BufferAttribute(new Float32Array(3 * size), size)
  for (const [name, size] of [['position', 3], ['normal', 3], ['uv', 2]]) geometry.setAttribute(name, vec(size))
  geometry.morphAttributes.position = [vec(3)]
  geometry.morphAttributes.normal = [vec(3)]
  geometry.morphTargetsRelative = true
  const mesh = new InstancedMesh(geometry, new MeshLambertMaterial({ map: BLANK }), BODIES.length)
  buildStatues(mesh)
  mesh.visible = false
  mesh.frustumCulled = false
  return mesh
}

/** Frees statues made by plainStatues or avatarStatues. */
function disposeStatues(mesh) {
  mesh.geometry.dispose()
  if (mesh.material !== sharedMaterials().toy) mesh.material.dispose()
  mesh.dispose()
}

/**
 * The plain statues, until your avatar's in (or if you wear a custom character): every
 * body on show an instance of one bodybuilder - thin, with the full bodybuilder as its
 * morph, so each is exactly as muscular as its body (setMorphAt) - in its own colour and
 * toy style, scaled to its body's height and width. One draw call.
 */
function plainStatues(count) {
  const thin = statueShape(0)
  const built = statueShape(1)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', thin.getAttribute('position'))
  geometry.setAttribute('normal', thin.getAttribute('normal'))
  const delta = (name) => {
    const a = thin.getAttribute(name).array
    const b = built.getAttribute(name).array
    const d = new Float32Array(a.length)
    for (let i = 0; i < a.length; i += 1) d[i] = b[i] - a[i]
    return new BufferAttribute(d, 3)
  }
  geometry.morphAttributes.position = [delta('position')]
  geometry.morphAttributes.normal = [delta('normal')]
  geometry.morphTargetsRelative = true
  built.dispose()
  const n = thin.getAttribute('position').count
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(1), 3))
  const styles = new Float32Array(count)
  BODIES.forEach((body, i) => {
    styles[i] = bodyLook(body.id).style
  })
  geometry.setAttribute('aStyle', new InstancedBufferAttribute(styles, 1))
  const mesh = new InstancedMesh(geometry, sharedMaterials().toy, count)
  BODIES.forEach((body, i) => {
    mesh.setColorAt(i, bodyColor(body.id))
    _morph.morphTargetInfluences[0] = bodyLook(body.id).bulk
    mesh.setMorphAt(i, _morph)
  })
  mesh.morphTexture.needsUpdate = true
  mesh.boundingSphere = standsBounds()
  mesh.castShadow = true
  return mesh
}

/**
 * The body shop: twenty-four display stands on the two shop stages, each a pad framed in
 * stone with a glowing pedestal in the body's colour and on it YOU - your own avatar,
 * in your own colours - in its body, each bigger than the last, flexing and turning
 * slowly. Pads recolour and their labels rewrite as you buy and wear
 * them. Three draw calls: stands, statues, halos.
 */
export function BodyShop() {
  const owned = useGame((s) => s.profile.ownedBodies)
  const equipped = useGame((s) => s.profile.equippedBody)
  const padsRef = useRef(null)
  const statuesRef = useRef(null)
  const glowRef = useRef(null)
  // On LOW the statues stand still, facing the plaza: placed once, nothing per frame.
  const still = useQuality((s) => s.level === 'LOW')
  const placedRef = useRef(false)

  const assets = useMemo(() => {
    const pads = buildStands()
    const glows = createGlowInstances(BODIES.length, 0.7)
    BODIES.forEach((body, i) => glows.setColorAt(i, bodyColor(body.id)))
    glows.count = BODIES.length
    glows.instanceColor.needsUpdate = true
    return { pads, glows, warmup: statueWarmup() }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(assets.pads)
      disposeGlow(assets.glows)
      disposeStatues(assets.warmup)
    },
    [assets],
  )

  // The statues: you, once your avatar's in (again for a new outfit); plain ones till then.
  const rig = useShowcase((s) => s.rig)
  const proportions = useShowcase((s) => s.proportions)
  const version = useShowcase((s) => s.version)
  const statues = useMemo(() => (rig && avatarStatues(rig, proportions)) || plainStatues(BODIES.length), [rig, proportions, version])
  useEffect(() => {
    placedRef.current = false
    return () => disposeStatues(statues)
  }, [statues])

  // Recolour pads and rewrite their labels whenever ownership changes.
  useEffect(() => {
    const pads = padsRef.current
    const profile = { ownedBodies: owned, equippedBody: equipped }
    for (const pad of BODY_PADS) {
      const state = padState(profile, pad.index)
      pads?.setColorAt(pad.index, PAD_COLORS[state])
      updateWorldLabel(`pad-${pad.index}`, padLabelSpec(pad.index, state))
    }
    if (pads?.instanceColor) pads.instanceColor.needsUpdate = true
  }, [owned, equipped])

  useFrame((state) => {
    const statues = statuesRef.current
    const glows = glowRef.current
    if (!statues || !glows) return
    if (still && placedRef.current) return
    placedRef.current = true
    const t = still ? 0 : state.clock.elapsedTime
    const glowSize = 3.6 * getQuality().glow
    for (const pad of BODY_PADS) {
      const look = bodyLook(BODIES[pad.index].id)
      // As tall as its body (the more muscular, the taller, as on the players) and as broad.
      const height = STATUE_HEIGHT * look.height * (0.95 + 0.17 * look.bulk)
      // Standing on the cap, turning slowly back and forth to show off to the plaza.
      _p.set(pad.x, pad.y + CAP_TOP, pad.z)
      _q.setFromEuler(_e.set(0, still ? 0 : Math.sin(t * 0.6 + pad.index) * 0.7, 0))
      statues.setMatrixAt(pad.index, _m.compose(_p, _q, _s.set(STATUE_HEIGHT * look.width, height, STATUE_HEIGHT * look.width)))
      _p.y += height * 0.62
      glows.setMatrixAt(pad.index, _m.compose(_p, _q, _glow.setScalar(glowSize)))
    }
    statues.instanceMatrix.needsUpdate = true
    glows.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <primitive ref={padsRef} object={assets.pads} />
      <primitive ref={statuesRef} object={statues} />
      <primitive object={assets.warmup} />
      <primitive ref={glowRef} object={assets.glows} />
    </>
  )
}

export default BodyShop
