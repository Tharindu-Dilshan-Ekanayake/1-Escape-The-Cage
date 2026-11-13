import { BufferGeometry, Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { hash2 } from '@shared/rng'

import { STAGES } from './course'

import { glowTime } from '../glow'

/**
 * Boulders: one per stage of the track, each its own kind of rock.
 *
 * One lumpy rock mesh for all of them, and one material whose fragment shader paints
 * each stage's look from the rock's own (object-space) surface, so the pattern rolls
 * with it: smooth mottled sand (as in the reference), frosted ice, grey stone, magma
 * with glowing cracks, candy swirls, glowing crystal, cratered moon rock, a spotted
 * toadstool, toxic slime and polished gold. Every boulder in the game - the
 * one waiting at each stage, yours, everyone else's - is an instance: one draw call.
 *
 * Unit radius; scale it by the stage's boulderRadius.
 */

/** Each stage's boulder: its base colour (the shader works out the rest). */
export const BOULDER_COLORS = {
  sand: '#e9c48d',
  ice: '#bfe9ff',
  grass: '#6b7286',
  volcano: '#3b2b2b',
  candy: '#ff8fd0',
  crystal: '#8a5cff',
  moon: '#b8bcc6',
  jungle: '#7a8466',
  beach: '#ff9a7a',
  spooky: '#ff8a1e',
  mushroom: '#e8303c',
  swamp: '#3a5a22',
  cloud: '#ffc61a',
  neon: '#ff3fd0',
  cyber: '#2fe8ff',
  factory: '#c9a23a',
  station: '#e6ebf2',
  mars: '#c8603a',
  asteroid: '#6a625a',
  galaxy: '#5a3aff',
}
/** Each kind of boulder's colour, by stage id, parsed as first needed. */
const colors = new Map()
const colorOf = (id) => {
  if (!colors.has(id)) colors.set(id, new Color(BOULDER_COLORS[id] ?? '#8f949c'))
  return colors.get(id)
}
/** Each kind of rock's branch in LOOK_GLSL, by stage id: the stages' order is free to change. */
const LOOK_IDS = {
  sand: 0,
  ice: 1,
  grass: 2,
  volcano: 3,
  candy: 4,
  beach: 4,
  crystal: 5,
  moon: 6,
  mars: 6,
  asteroid: 6,
  jungle: 7,
  spooky: 8,
  factory: 9,
  station: 9,
  neon: 10,
  cyber: 10,
  galaxy: 11,
  mushroom: 12,
  swamp: 13,
  cloud: 14,
}


const fade = (t) => t * t * (3 - 2 * t)

/** Smooth 3D value noise in [0, 1): lattice hashes, blended with smoothstep. */
function noise3(x, y, z, seed) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const u = fade(x - ix)
  const v = fade(y - iy)
  const w = fade(z - iz)
  const h = (a, b, c) => hash2(a, b * 7919 + c * 104729, seed)
  const lerp = (a, b, t) => a + (b - a) * t
  return lerp(
    lerp(lerp(h(ix, iy, iz), h(ix + 1, iy, iz), u), lerp(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), u), v),
    lerp(lerp(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), u), lerp(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), u), v),
    w,
  )
}

let baseGeometry = null
/**
 * A sphere pushed in and out by smooth noise into a rounded, lumpy rock: indexed (so
 * the lumps stay smooth) and 720 triangles - enough for a round outline and small
 * knobbles as well as the big lumps.
 */
function boulderGeometry() {
  if (baseGeometry) return baseGeometry
  const sphere = new IcosahedronGeometry(1, 5)
  sphere.deleteAttribute('normal')
  sphere.deleteAttribute('uv')
  const g = mergeVertices(sphere)
  sphere.dispose()
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    // Three octaves of smooth noise over the sphere's surface: a few big lumps and dents,
    // and knobbles on them.
    const r =
      0.92 +
      noise3(x * 1.6 + 5, y * 1.6 + 5, z * 1.6 + 5, 3) * 0.12 +
      noise3(x * 3.4 + 9, y * 3.4 + 9, z * 3.4 + 9, 7) * 0.05 +
      noise3(x * 7 + 2, y * 7 + 2, z * 7 + 2, 11) * 0.022
    p.setXYZ(i, x * r, y * r, z * r)
  }
  g.computeVertexNormals()
  g.computeBoundingSphere()
  baseGeometry = g
  return g
}

const vertexHead = /* glsl */ `
  attribute float aBStage;
  varying vec3 vBObj;
  varying float vBStage;
  varying float vBUp;
`
const vertexBody = /* glsl */ `
  vBObj = position;
  vBStage = aBStage;
  // How much the surface here faces up in the world (-1 underneath, 1 on top).
  vBUp = normalize((modelMatrix * instanceMatrix * vec4(objectNormal, 0.0)).xyz).y;
`

const fragmentHead = /* glsl */ `
  uniform float uBTime;
  varying vec3 vBObj;
  varying float vBStage;
  varying float vBUp;

  float bHash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }
  float bNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(bHash3(i), bHash3(i + vec3(1, 0, 0)), f.x), mix(bHash3(i + vec3(0, 1, 0)), bHash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(bHash3(i + vec3(0, 0, 1)), bHash3(i + vec3(1, 0, 1)), f.x), mix(bHash3(i + vec3(0, 1, 1)), bHash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float bFbm(vec3 p) {
    return bNoise(p) * 0.6 + bNoise(p * 2.1) * 0.3 + bNoise(p * 4.3) * 0.1;
  }
  // 1 along thin winding lines where the crack field (see LOOK_GLSL) is near 0: cracks
  // and veins, width wide.
  float bCracks(float field, float width) {
    return 1.0 - smoothstep(0.0, width, field);
  }
  // How high the rock's surface stands here (set by LOOK_GLSL), for the light to show its
  // bumps and grooves.
  float bHeight = 0.0;
  // The normal tilted by the slope of bHeight across the screen: bump mapping without a
  // texture (as three's perturbNormalArb).
  vec3 bBump(vec3 pos, vec3 nrm, float h) {
    vec3 dx = dFdx(pos);
    vec3 dy = dFdy(pos);
    vec3 r1 = cross(dy, nrm);
    vec3 r2 = cross(nrm, dx);
    float det = dot(dx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * nrm - grad);
  }
`

/** Each kind of rock's look (LOOK_IDS), chosen per instance by vBStage. */
const LOOK_GLSL = /* glsl */ `
  {
    vec3 p = vBObj;
    vec3 base = diffuseColor.rgb;
    vec3 col = base;
    vec3 glow = vec3(0.0);
    float s = vBStage + 0.5;
    float n = bFbm(p * 2.6);
    // One crack field for every cracked or veined look, each taking its own width: worked
    // out once here rather than in each, which kept the shader slow to compile.
    float cracks = abs(bNoise(p * 2.1) + bNoise(p * 4.8) * 0.35 - 0.68);
    // How rough each look is to the light: rock fully, glossy ones hardly.
    float rough = 1.0;
    if (s < 1.0) {
      // Sand: smooth beige, softly mottled with darker and lighter patches.
      float blotch = smoothstep(0.45, 0.75, bNoise(p * 1.7 + 3.0));
      col = base * (0.92 + n * 0.16);
      col = mix(col, base * 0.78, blotch * 0.6);
      col = mix(col, min(base * 1.12, vec3(1.0)), smoothstep(0.55, 0.8, bNoise(p * 3.3)) * 0.35);
      rough = 0.7;
    } else if (s < 2.0) {
      // Ice: frosted white over pale blue, streaked, with a cold inner glow and sparkle.
      float streak = smoothstep(0.45, 0.75, bNoise(vec3(p.x * 6.0, p.y * 1.2, p.z * 6.0)));
      col = mix(base, vec3(0.97, 0.99, 1.0), streak * 0.7 + n * 0.25);
      col *= 1.0 - bCracks(cracks, 0.03) * 0.25;
      glow = base * 0.18 + vec3(0.8) * step(0.985, bHash3(floor(p * 30.0))) * (0.6 + 0.4 * sin(uBTime * 6.0 + p.x * 20.0));
      rough = 0.5;
    } else if (s < 3.0) {
      // Stone: rough grey-blue granite - mottled, grainy, with dark cracks and pale flecks.
      float grain = bHash3(floor(p * 26.0));
      col = base * (0.72 + n * 0.5) * (0.9 + grain * 0.2);
      col *= 1.0 - bCracks(cracks, 0.035) * 0.5;
      col = mix(col, vec3(0.86, 0.88, 0.92), step(0.93, grain) * 0.4);
    } else if (s < 4.0) {
      // Magma: a dark crust split by glowing, pulsing cracks.
      float c = bCracks(cracks, 0.07);
      float pulse = 0.75 + 0.25 * sin(uBTime * 3.0 + p.y * 4.0);
      col = base * (0.7 + n * 0.5);
      vec3 hot = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.75, 0.15), c);
      col = mix(col, hot, c);
      glow = hot * c * 1.4 * pulse;
    } else if (s < 5.0) {
      // Candy: pink and white swirls round it, glossy.
      float a = atan(p.z, p.x);
      float swirl = step(0.5, fract(a / 6.2831853 * 4.0 + p.y * 1.2));
      col = mix(base, vec3(1.0), swirl * 0.85);
      glow = col * 0.12;
      rough = 0.15;
    } else if (s < 6.0) {
      // Crystal: glowing violet facets, lighter along their edges.
      vec3 f = abs(fract(p * 2.5) - 0.5);
      float edge = smoothstep(0.38, 0.48, max(f.x, max(f.y, f.z)));
      col = mix(base, vec3(0.85, 0.75, 1.0), edge * 0.6 + n * 0.2);
      glow = base * (0.35 + 0.15 * sin(uBTime * 2.0 + p.y * 3.0)) + vec3(0.6, 0.5, 1.0) * edge * 0.3;
      rough = 0.4;
    } else if (s < 7.0) {
      // Moon rock: pale grey dusted with craters, each a dark ring round a lighter floor.
      vec3 cell = floor(p * 3.0);
      vec3 local = fract(p * 3.0) - 0.5;
      float r = length(local + (vec3(bHash3(cell), bHash3(cell + 3.1), bHash3(cell + 7.7)) - 0.5) * 0.4);
      float size = 0.18 + bHash3(cell + 1.3) * 0.18;
      float rim = smoothstep(size * 0.7, size, r) * (1.0 - smoothstep(size, size * 1.25, r));
      float floorMask = 1.0 - smoothstep(size * 0.6, size * 0.8, r);
      col = base * (0.85 + n * 0.25);
      col *= 1.0 - rim * 0.35;
      col = mix(col, base * 0.75, floorMask * 0.6);
    } else if (s < 8.0) {
      // Mossy stone: cracked grey-green rock with patches of moss.
      col = base * (0.75 + n * 0.45);
      col *= 1.0 - bCracks(cracks, 0.035) * 0.4;
      float moss = smoothstep(0.5, 0.72, bNoise(p * 2.0 + 7.0));
      col = mix(col, vec3(0.24, 0.58, 0.2) * (0.8 + n * 0.4), moss);
    } else if (s < 9.0) {
      // Pumpkin: orange ribs round it, faintly lit from inside.
      float rib = abs(sin(atan(p.z, p.x) * 5.0));
      col = base * (0.7 + 0.35 * rib) * (0.9 + n * 0.2);
      glow = base * 0.14;
      rough = 0.4;
    } else if (s < 10.0) {
      // Metal: riveted plates with dark seams.
      vec3 f = abs(fract(p * 3.0) - 0.5);
      float seam = smoothstep(0.44, 0.48, max(f.x, max(f.y, f.z)));
      col = base * (0.82 + n * 0.22) * (1.0 - seam * 0.45);
      col = mix(col, vec3(0.95), step(0.975, bHash3(floor(p * 12.0))) * 0.5);
      rough = 0.3;
    } else if (s < 11.0) {
      // Neon: a dark shell under a glowing, pulsing grid.
      vec3 f = abs(fract(p * 2.5) - 0.5);
      float line = smoothstep(0.42, 0.48, max(f.x, max(f.y, f.z)));
      col = mix(vec3(0.06, 0.06, 0.12), base, line);
      glow = base * line * 1.4 * (0.75 + 0.25 * sin(uBTime * 3.0 + p.y * 5.0));
      rough = 0.15;
    } else if (s < 12.0) {
      // Galaxy: deep space swirling with nebula, scattered with stars.
      float star = step(0.985, bHash3(floor(p * 40.0)));
      float nebula = smoothstep(0.5, 0.8, bNoise(p * 1.5 + uBTime * 0.05));
      col = base * (0.35 + n * 0.4);
      col = mix(col, vec3(1.0, 0.45, 0.85) * 0.7, nebula * 0.5) + vec3(star);
      glow = base * 0.3 + vec3(star) * 0.8 + vec3(0.6, 0.2, 0.5) * nebula * 0.3;
      rough = 0.3;
    } else if (s < 13.0) {
      // Toadstool: a red cap dotted with round white spots.
      vec3 cell = floor(p * 2.2);
      vec3 local = fract(p * 2.2) - 0.5;
      float r = length(local + (vec3(bHash3(cell), bHash3(cell + 3.1), bHash3(cell + 7.7)) - 0.5) * 0.3);
      float spot = (1.0 - smoothstep(0.3, 0.35, r)) * step(0.15, bHash3(cell + 5.3));
      col = mix(base * (0.85 + n * 0.25), vec3(1.0, 0.97, 0.92), spot);
      glow = col * 0.1;
      rough = 0.25;
    } else if (s < 14.0) {
      // Slime: dark green goo with glowing toxic veins and bubbles, pulsing.
      float c = bCracks(cracks, 0.08);
      float pulse = 0.7 + 0.3 * sin(uBTime * 2.5 + p.y * 5.0);
      float bubble = step(0.96, bHash3(floor(p * 9.0)));
      vec3 toxic = vec3(0.55, 1.0, 0.15);
      col = mix(base * (0.55 + n * 0.5), toxic, max(c, bubble * 0.8));
      glow = toxic * (c * 1.1 * pulse + bubble * 0.5) + base * 0.08;
      rough = 0.5;
    } else {
      // Gold: polished and bright, soft bands of shine and the odd sparkle.
      float band = 0.5 + 0.5 * sin((p.y + p.x * 0.4) * 7.0 + n * 2.0);
      float sparkle = step(0.985, bHash3(floor(p * 34.0))) * (0.6 + 0.4 * sin(uBTime * 5.0 + p.z * 17.0));
      col = base * (0.75 + band * 0.4 + n * 0.15);
      glow = base * 0.22 + vec3(1.0, 0.95, 0.7) * sparkle;
      rough = 0.2;
    }
    // Lumps from the noise, grooves down the cracks; in every look's own roughness.
    bHeight = (n - bCracks(cracks, 0.06) * 0.45) * rough * 0.4;
    // A little darker down in the grooves, as the light doesn't get in there; and darker
    // underneath, in its own shadow by the ground, so it sits heavy on the track.
    col *= 1.0 - bCracks(cracks, 0.06) * 0.18 * rough;
    col *= mix(0.6, 1.0, smoothstep(-0.85, 0.25, vBUp));
    diffuseColor.rgb = col;
    totalEmissiveRadiance += glow;
  }
`

/**
 * A soft warm rim of light round the upper edge of every boulder, as if the sky lit it
 * from behind, so it stands out from the track - kept off its underside, so it reads as
 * solid rock rather than glass.
 */
const RIM_GLSL = /* glsl */ `
  {
    float facing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    outgoingLight += vec3(1.0, 0.95, 0.85) * pow(1.0 - facing, 3.0) * 0.2 * smoothstep(-0.3, 0.6, vBUp);
  }
`

let sharedMaterial = null

/** The one material every boulder uses. */
export function boulderMaterial() {
  if (!sharedMaterial) {
    sharedMaterial = new MeshLambertMaterial({ color: 0xffffff })
    sharedMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${vertexHead}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${fragmentHead}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${LOOK_GLSL}`)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = bBump(-vViewPosition, normal, bHeight);')
        .replace('#include <opaque_fragment>', `${RIM_GLSL}\n#include <opaque_fragment>`)
      // The lobby's clock, which already ticks every frame for the halos.
      shader.uniforms.uBTime = glowTime
    }
    sharedMaterial.customProgramCacheKey = () => 'boulder-v6'
  }
  return sharedMaterial
}

/**
 * Up to `max` boulders in one draw call. Place them with setMatrixAt and pick each one's
 * kind with `setStage(index, stage)`; set `.count` to how many to draw.
 */
export function createBoulderMesh(max) {
  const base = boulderGeometry()
  // Own geometry object (it needs its own per-instance stage), sharing the rock's buffers.
  const geometry = new BufferGeometry()
  geometry.setIndex(base.index)
  for (const name of ['position', 'normal']) geometry.setAttribute(name, base.getAttribute(name))
  geometry.boundingSphere = base.boundingSphere
  const stages = new InstancedBufferAttribute(new Float32Array(max), 1)
  geometry.setAttribute('aBStage', stages)
  const mesh = new InstancedMesh(geometry, boulderMaterial(), max)
  mesh.setColorAt(0, colorOf('grass'))
  mesh.count = 0
  mesh.frustumCulled = false
  mesh.castShadow = true
  const set = new Array(max).fill('')

  /** Makes instance `i` the boulder of stage `stage` of the world you're in; cheap to call every frame. */
  mesh.setStage = (i, stage) => {
    const id = STAGES[stage]?.id ?? 'grass'
    if (set[i] === id) return
    set[i] = id
    mesh.setColorAt(i, colorOf(id))
    stages.setX(i, LOOK_IDS[id] ?? 0)
    mesh.instanceColor.needsUpdate = true
    stages.needsUpdate = true
  }
  return mesh
}

/** Frees a mesh made by createBoulderMesh (the shared rock and material stay). */
export function disposeBoulderMesh(mesh) {
  mesh.geometry.dispose()
  mesh.dispose()
}
