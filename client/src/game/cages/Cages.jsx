import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial, Vector3 } from 'three'

import { formatNumber } from '@shared/format'
import { mulberry32 } from '@shared/rng'
import { cageWallZ, GAUNTLET, roomCenterZ, winPadRect } from '@shared/world'

import { getQuality, useQuality } from '../../store/quality'
import { disposeBlocks } from '../blocks'
import { LabelBatch } from '../labels/LabelBatch'
import { sharedMaterials } from '../materials'
import { FOG, SKY } from '../sceneStyle'
import { skyUniforms } from '../skyState'
import { buildDoors, buildGauntlet, easeOutBack, placeDoor } from './cageBuild'
import { barValue, OPEN_MS, run } from './cageControl'
import { CAGES, WORLD } from './course'
import { cageGradient, WORLD_SKIES } from './themes'

const GOLD = ['#fffaa8', '#ffd52a', '#ff9c00']
const DEFAULT_TOP = new Color(SKY.top)
const DEFAULT_HORIZON = new Color(SKY.horizon)
const DEFAULT_FOG = new Color(FOG.color)
const _p = new Vector3()
/** While a cage is being pulled at, its bars give this much of the way (with a full break bar). */
const GIVE = 0.3

/**
 * Lazily loaded (the lobby comes first): the gauntlet of cages of the world you're in -
 * its rooms, bars and WIN pads in a few draw calls (the far chunks culled), their signs in a small label batch,
 * and the world's sky. Mounted afresh for each world (see GameScene). The bars of the
 * cage you're pulling at give as its break bar fills, spring open when it breaks, and
 * snap back straight when the run ends; nothing else in it moves.
 */
export default function Cages() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const rootRef = useRef(null)
  const labelsRef = useRef(null)
  const doorsRef = useRef(null)
  const starsRef = useRef(null)
  const shadows = useQuality((s) => s.settings.shadows === 'realtime')
  const particles = useQuality((s) => s.settings.particles)
  /**
   * The run.version the doors were last placed for; the cages still springing open (each
   * from how far it had given); and the cage being pulled at, with how far it's given.
   */
  const placed = useRef(-1)
  const bending = useRef(new Map())
  const pulled = useRef({ cage: -1, amount: 0 })

  const assets = useMemo(() => {
    const material = sharedMaterials().blocks
    const blocks = buildGauntlet(CAGES).map((set) => set.build(material))
    const doors = buildDoors(CAGES).build(material)
    // Their matrices change as they bend: bounds over the whole gauntlet, set once.
    doors.matrixAutoUpdate = false
    // A night full of stars over a world out of this one.
    const lobby = WORLD_SKIES[WORLD]
    let stars = null
    if (lobby?.stars) {
      const rand = mulberry32(99)
      const positions = new Float32Array(500 * 3)
      for (let i = 0; i < 500; i += 1) {
        _p.set(rand() * 2 - 1, rand() * 1.2 - 0.1, rand() * 2 - 1).normalize().multiplyScalar(140)
        positions.set([_p.x, _p.y, _p.z], i * 3)
      }
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(positions, 3))
      stars = new Points(geometry, new PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false, depthWrite: false }))
      stars.frustumCulled = false
    }
    return { blocks, doors, stars, sky: lobby ? lobby.sky.map((c) => new Color(c)) : null }
  }, [])

  // This world's sky while it's up; the default one back when it goes.
  useEffect(() => {
    const sky = assets.sky
    skyUniforms.topColor.value.copy(sky ? sky[0] : DEFAULT_TOP)
    skyUniforms.horizonColor.value.copy(sky ? sky[1] : DEFAULT_HORIZON)
    if (scene.fog) scene.fog.color.copy(sky ? sky[1] : DEFAULT_FOG)
    return () => {
      skyUniforms.topColor.value.copy(DEFAULT_TOP)
      skyUniforms.horizonColor.value.copy(DEFAULT_HORIZON)
      if (scene.fog) scene.fog.color.copy(DEFAULT_FOG)
    }
  }, [assets, scene])

  useEffect(
    () => () => {
      for (const chunk of assets.blocks) disposeBlocks(chunk)
      disposeBlocks(assets.doors)
      if (assets.stars) {
        assets.stars.geometry.dispose()
        assets.stars.material.dispose()
      }
    },
    [assets],
  )

  // Loaded after the lobby is on screen: compile its shaders in the background before
  // showing it, so walking up to the first cage never stalls on them. (Not in dev, where
  // StrictMode's remount disposes materials mid-compile.)
  useEffect(() => {
    const root = rootRef.current
    if (!root || import.meta.env.DEV) return undefined
    let cancelled = false
    root.visible = false
    gl.compileAsync(root, camera, scene)
      .catch(() => null)
      .finally(() => {
        if (!cancelled) root.visible = true
      })
    return () => {
      cancelled = true
    }
  }, [gl, camera, scene])

  // Their signs: what the gauntlet is, over the way in; each cage's name and the
  // Strength it takes over its bars; each WIN pad's Wins; and the gate at the end.
  useEffect(() => {
    const batch = new LabelBatch({ pageSize: Math.min(512, getQuality().maxTexture) })
    const start = GAUNTLET.startZ
    batch.add(
      'gauntlet',
      [0, GAUNTLET.height + 5.2, start + 1.2],
      { lines: [{ text: 'THE CAGES', size: 76, gradient: GOLD }, { text: 'Break out! Every room pays Wins!', size: 36, fill: '#ffffff' }], pxPerUnit: 30 },
      { fade: 220 },
    )
    CAGES.forEach((cage, i) => {
      const lines = [
        { text: `CAGE ${i + 1}`, size: 40, fill: '#ffffff' },
        { text: cage.name, size: 56, gradient: cageGradient(cage.id) },
        { text: `${formatNumber(cage.need)} Recommended`, size: 40, icon: 'muscle', gradient: GOLD },
      ]
      batch.add(`cage-${i}`, [0, 6.6, cageWallZ(i) + 0.9], { lines, pxPerUnit: 56 }, { fade: 120, near: 5 })
      const pad = winPadRect(i)
      const padLines = [
        { text: i === CAGES.length - 1 ? 'ESCAPE!' : 'WIN', size: 54, gradient: GOLD },
        { text: `+${formatNumber(cage.wins)}`, size: 66, icon: 'trophy', fill: '#ffffff' },
      ]
      batch.add(`pad-${i}`, [(pad.minX + pad.maxX) / 2, 3.1, roomCenterZ(i)], { lines: padLines, pxPerUnit: 70 }, { fade: 90 })
    })
    batch.add(
      'gate',
      [0, GAUNTLET.height - 1.5, cageWallZ(CAGES.length) + 1.5],
      { lines: [{ text: 'YOU ESCAPED!', size: 70, rainbow: true }, { text: 'Cash in on the last pad!', size: 38, fill: '#ffffff' }], pxPerUnit: 40 },
      { fade: 120 },
    )
    let cancelled = false
    batch.build().then((meshes) => {
      if (cancelled || !labelsRef.current) return
      for (const mesh of meshes) labelsRef.current.add(mesh)
    })
    return () => {
      cancelled = true
      batch.dispose()
    }
  }, [])

  useFrame(() => {
    const doors = doorsRef.current
    if (!doors) return
    const now = performance.now()
    const pull = pulled.current
    // The run changed (a cage broke, or every cage is whole again): place them all.
    if (placed.current !== run.version) {
      placed.current = run.version
      const from = new Map(bending.current)
      if (pull.cage >= 0) from.set(pull.cage, pull.amount)
      bending.current.clear()
      for (let i = 0; i < CAGES.length; i += 1) {
        const at = run.brokenAt[i]
        if (at > 0 && now - at < OPEN_MS) bending.current.set(i, from.get(i) ?? 0)
        placeDoor(doors, i, at > 0 ? (now - at < OPEN_MS ? from.get(i) ?? 0 : 1) : 0)
      }
      pull.cage = -1
      pull.amount = 0
    } else if (bending.current.size) {
      for (const [i, start] of bending.current) {
        const t = Math.min(1, (now - run.brokenAt[i]) / OPEN_MS)
        placeDoor(doors, i, start + (1 - start) * easeOutBack(t))
        if (t >= 1) bending.current.delete(i)
      }
    }
    // The cage being pulled at gives as its break bar fills, and straightens as it drains.
    const next = run.broken
    if (next < CAGES.length) {
      const amount = GIVE * barValue()
      if (pull.cage !== next || Math.abs(amount - pull.amount) > 0.002) {
        pull.cage = next
        pull.amount = amount
        placeDoor(doors, next, amount)
      }
    }
    const stars = starsRef.current
    if (stars) {
      stars.visible = particles
      stars.position.copy(camera.position)
    }
  })

  return (
    <group ref={rootRef}>
      {assets.blocks.map((chunk) => (
        <primitive key={chunk.uuid} object={chunk} castShadow={shadows} receiveShadow={shadows} />
      ))}
      <primitive ref={doorsRef} object={assets.doors} castShadow={shadows} receiveShadow={shadows} />
      <group ref={labelsRef} />
      {assets.stars && <primitive ref={starsRef} object={assets.stars} />}
    </group>
  )
}
