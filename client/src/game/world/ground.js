import {
  BufferAttribute,
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'

import {
  AURA_STAND,
  AVENUES,
  EGG_STANDS,
  FREE_REWARD,
  HUB,
  LEADERBOARDS,
  GAUNTLET,
  PORTALS,
  POTION_STAND,
  PLAZA,
  SHOP,
  SPHINX_STAND,
  ZONE_COUNT,
  zoneDeckRect,
} from '@shared/world'

import { PALETTE } from '../sceneStyle'

/**
 * Each avenue's runner, by the area it leads to: the same signal colours in every world,
 * so you learn them - red to the cages, orange to training, blue to the bodies, gold to
 * the pets, violet to World 2.
 */
export const RUNNERS = { cages: '#e8473b', training: '#ff8a1f', bodies: '#2f9bff', pets: '#ffc61a', world2: '#a35cff' }

/**
 * The plaza floor: one big plane whose colours come from a tiny "ground map" texture
 * painted at one texel per world unit. Paths, aprons and pads are rectangles painted
 * into it, so their edges always fall on the stud-tile seams, and the whole floor is a
 * single draw call regardless of how many painted regions it has.
 */

const MAP = { minX: PLAZA.minX - 10, maxX: PLAZA.maxX + 10, minZ: PLAZA.minZ, maxZ: PLAZA.maxZ + 8 }
const MAP_W = MAP.maxX - MAP.minX
const MAP_H = MAP.maxZ - MAP.minZ

/** Where the ground plane ends to the north: the gauntlet's own floors take over there. */
export const GROUND_NORTH_EDGE = GAUNTLET.startZ

function painter(ctx) {
  const rect = (r, color) => {
    ctx.fillStyle = color
    ctx.fillRect(
      Math.round(r.minX - MAP.minX),
      Math.round(r.minZ - MAP.minZ),
      Math.round(r.maxX - r.minX),
      Math.round(r.maxZ - r.minZ),
    )
  }
  const bordered = (r, fill, edge) => {
    rect(r, edge)
    rect({ minX: r.minX + 1, maxX: r.maxX - 1, minZ: r.minZ + 1, maxZ: r.maxZ - 1 }, fill)
  }
  const disc = (x, z, radius, color) => {
    ctx.fillStyle = color
    for (let dz = -radius; dz < radius; dz += 1) {
      for (let dx = -radius; dx < radius; dx += 1) {
        if ((dx + 0.5) ** 2 + (dz + 0.5) ** 2 <= radius * radius) {
          ctx.fillRect(Math.floor(x + dx - MAP.minX), Math.floor(z + dz - MAP.minZ), 1, 1)
        }
      }
    }
  }
  /** A rect of bricks: rows a texel deep, each brick two long, alternate rows offset, in two shades. */
  const bricks = (r, a, b) => {
    for (let z = Math.round(r.minZ); z < Math.round(r.maxZ); z += 1) {
      for (let x = Math.round(r.minX); x < Math.round(r.maxX); x += 1) {
        ctx.fillStyle = (Math.floor((x + (z & 1)) / 2) + z) & 1 ? a : b
        ctx.fillRect(x - MAP.minX, z - MAP.minZ, 1, 1)
      }
    }
  }
  return { rect, bordered, disc, bricks }
}

export function createGroundMap(maxTexture) {
  const canvas = document.createElement('canvas')
  canvas.width = MAP_W
  canvas.height = MAP_H
  const ctx = canvas.getContext('2d')
  const { rect, bordered, disc, bricks } = painter(ctx)

  rect(MAP, PALETTE.plaza)

  // Each area's paved ground: the Train Zones' apron, the way into the cages, the pets'
  // and leaderboards' plaza, the shop yard, and a paved circle round each stand.
  const first = zoneDeckRect(0)
  const last = zoneDeckRect(ZONE_COUNT - 1)
  bordered({ minX: first.minX - 2, maxX: first.maxX + 3, minZ: last.minZ - 2, maxZ: first.maxZ + 2 }, PALETTE.apron, PALETTE.apronEdge)
  bordered({ minX: -GAUNTLET.halfWidth - 3, maxX: GAUNTLET.halfWidth + 3, minZ: GAUNTLET.startZ, maxZ: GAUNTLET.startZ + 8 }, PALETTE.apron, PALETTE.apronEdge)
  bordered({ minX: EGG_STANDS[0].x - 6, maxX: SPHINX_STAND.x + 6, minZ: EGG_STANDS[0].z - 6, maxZ: LEADERBOARDS[0].z + 3 }, PALETTE.apron, PALETTE.apronEdge)
  rect({ minX: SHOP.minX, maxX: SHOP.maxX, minZ: SHOP.minZ, maxZ: SHOP.maxZ }, PALETTE.shopFloor)
  for (const p of PORTALS) {
    disc(p.x, p.z, 7, RUNNERS.world2)
    disc(p.x, p.z, 6, PALETTE.apron)
  }
  for (const stand of [AURA_STAND, POTION_STAND]) {
    disc(stand.x, stand.z, 6, PALETTE.apronEdge)
    disc(stand.x, stand.z, 5, PALETTE.apron)
  }
  disc(FREE_REWARD.x, FREE_REWARD.z, 4, PALETTE.apronEdge)

  // The avenues: brick, kerbed, each with its runner up the middle from the hub out.
  for (const a of AVENUES) bordered({ minX: a.minX - 1, maxX: a.maxX + 1, minZ: a.minZ - 1, maxZ: a.maxZ + 1 }, PALETTE.pathEdge, PALETTE.pathEdge)
  for (const a of AVENUES) bricks(a, PALETTE.path, PALETTE.pathAlt)
  for (const a of AVENUES) {
    const color = RUNNERS[a.id]
    if (a.maxX - a.minX >= a.maxZ - a.minZ) {
      const z = Math.round((a.minZ + a.maxZ) / 2)
      rect({ minX: a.minX, maxX: a.maxX, minZ: z - 2, maxZ: z + 2 }, PALETTE.runnerEdge)
      rect({ minX: a.minX, maxX: a.maxX, minZ: z - 1, maxZ: z + 1 }, color)
    } else {
      const x = Math.round((a.minX + a.maxX) / 2)
      rect({ minX: x - 2, maxX: x + 2, minZ: a.minZ, maxZ: a.maxZ }, PALETTE.runnerEdge)
      rect({ minX: x - 1, maxX: x + 1, minZ: a.minZ, maxZ: a.maxZ }, color)
    }
  }
  // The hub round spawn, paved in rings, where the runners start.
  disc(HUB.x, HUB.z, HUB.radius + 1, PALETTE.pathEdge)
  for (let r = HUB.radius; r > 0; r -= 1) disc(HUB.x, HUB.z, r, (HUB.radius - r) % 3 === 2 ? PALETTE.pathAlt : PALETTE.path)
  disc(HUB.x, HUB.z, 3, PALETTE.runnerEdge)
  disc(HUB.x, HUB.z, 2, RUNNERS.cages)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.anisotropy = maxTexture > 512 ? 4 : 1
  return texture
}

/**
 * The ground plane, with UVs computed from world position so the map lands exactly
 * on the world grid. Outside the map, clamp-to-edge repeats the plaza colour.
 */
export function createGroundGeometry() {
  const minX = -280
  const maxX = 280
  const minZ = GROUND_NORTH_EDGE
  const maxZ = 280
  const geometry = new PlaneGeometry(maxX - minX, maxZ - minZ)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2)

  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    uv.setXY(i, (x - MAP.minX) / MAP_W, 1 - (z - MAP.minZ) / MAP_H)
  }
  uv.needsUpdate = true
  geometry.setAttribute('aStyle', new BufferAttribute(new Float32Array(position.count), 1))
  return geometry
}
